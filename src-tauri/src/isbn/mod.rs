pub mod douban;
pub mod goodreads;
mod google_books;
mod open_library;

use serde::{Deserialize, Serialize};
use anyhow::{anyhow, Result};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct BookMeta {
    pub title: Option<String>,
    pub author: Option<String>,
    pub translator: Option<String>,
    pub publisher: Option<String>,
    pub pub_date: Option<String>,
    pub cover_url: Option<String>,
    pub description: Option<String>,
    pub language: Option<String>,
    pub region: Option<String>,
    pub category: Option<String>,
    pub isbn: Option<String>,
    pub rating: Option<i32>,
    pub series: Option<String>,
    pub douban_rating: Option<f64>,
    pub goodreads_rating: Option<f64>,
}

/// 来源站点的可识别失败类型；其余错误仍为普通 anyhow 错误。
/// 通过 `err.downcast_ref::<SourceError>()` 判断，Display 文案保持面向用户。
#[derive(Debug)]
pub enum SourceError {
    /// 豆瓣 Cookie 已失效（被重定向到登录页 / 页面为未登录状态）
    CookieExpired,
    /// 被反爬拦截（HTTP 202/403/429、验证页等），稍后重试可能恢复
    Blocked(String),
    /// 站点没有这本书
    NotFound(String),
}

impl std::fmt::Display for SourceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SourceError::CookieExpired => write!(f, "豆瓣 Cookie 已失效，请在设置中更新 Cookie"),
            SourceError::Blocked(m) | SourceError::NotFound(m) => write!(f, "{}", m),
        }
    }
}

impl std::error::Error for SourceError {}

/// Normalize various date strings to ISO format: "YYYY", "YYYY-MM", or "YYYY-MM-DD".
/// Handles dash-separated numeric dates and English month-name formats.
pub fn normalize_date(s: &str) -> Option<String> {
    let s = s.trim();
    if s.is_empty() { return None; }

    // Dash-separated numeric: "2018", "2018-9", "2018-09-01"
    if s.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
        let parts: Vec<&str> = s.splitn(3, '-').collect();
        if let Ok(y) = parts[0].parse::<u32>() {
            if (1000..=9999).contains(&y) {
                if parts.len() == 1 {
                    return Some(format!("{:04}", y));
                }
                if let Ok(m) = parts[1].trim().parse::<u32>() {
                    if (1..=12).contains(&m) {
                        if parts.len() == 2 {
                            return Some(format!("{:04}-{:02}", y, m));
                        }
                        let day_tok = parts[2].split(|c: char| !c.is_ascii_digit()).next().unwrap_or("");
                        if let Ok(d) = day_tok.parse::<u32>() {
                            if (1..=31).contains(&d) {
                                return Some(format!("{:04}-{:02}-{:02}", y, m, d));
                            }
                        }
                        return Some(format!("{:04}-{:02}", y, m));
                    }
                }
                return Some(format!("{:04}", y));
            }
        }
    }

    // English month-name formats: "January 2018", "Oct 11, 2021", "11 October 2021"
    let month_num = |tok: &str| -> Option<u32> {
        match tok.to_lowercase().trim_matches(|c: char| !c.is_alphabetic()) {
            "jan" | "january"   => Some(1),  "feb" | "february"  => Some(2),
            "mar" | "march"     => Some(3),  "apr" | "april"     => Some(4),
            "may"               => Some(5),  "jun" | "june"      => Some(6),
            "jul" | "july"      => Some(7),  "aug" | "august"    => Some(8),
            "sep" | "sept" | "september" => Some(9),
            "oct" | "october"   => Some(10), "nov" | "november"  => Some(11),
            "dec" | "december"  => Some(12), _ => None,
        }
    };

    let mut year: Option<u32> = None;
    let mut month: Option<u32> = None;
    let mut day: Option<u32> = None;

    for tok in s.split_whitespace() {
        let clean: String = tok.chars().filter(|c| c.is_alphanumeric()).collect();
        if let Ok(n) = clean.parse::<u32>() {
            if (1000..=9999).contains(&n) { year = Some(n); }
            else if (1..=31).contains(&n) && day.is_none() { day = Some(n); }
        } else if month.is_none() {
            month = month_num(&clean);
        }
    }

    match (year, month, day) {
        (Some(y), Some(m), Some(d)) => Some(format!("{:04}-{:02}-{:02}", y, m, d)),
        (Some(y), Some(m), None)    => Some(format!("{:04}-{:02}", y, m)),
        (Some(y), None, _)          => Some(format!("{:04}", y)),
        _ => None,
    }
}

/// Search by title+author across sources; used for AI discovery enrichment.
/// Always returns at least a BookMeta with the given title (never fails).
pub async fn discover_search(
    title: &str,
    author: &str,
    google_api_key: Option<&str>,
    douban_cookie: Option<&str>,
) -> BookMeta {
    let has_cookie = douban_cookie.map_or(false, |c| !c.trim().is_empty());

    // Try Douban first when cookie is available (best for Chinese books)
    if has_cookie {
        match douban::search(title, douban_cookie).await {
            Ok(meta) if meta.title.is_some() || meta.publisher.is_some() => {
                eprintln!("[enrich] {:?} → douban search ok (cover={} isbn={:?})",
                    title, meta.cover_url.is_some(), meta.isbn);
                return meta;
            }
            Ok(_) => eprintln!("[enrich] {:?} → douban search empty", title),
            Err(e) => eprintln!("[enrich] {:?} → douban search err: {}", title, e),
        }
    }

    // Try Google Books; if it returns an ISBN but no cover, attempt a Douban fetch by ISBN
    match google_books::search_by_title_author(title, author, google_api_key).await {
        Ok(mut meta) if meta.title.is_some() => {
            if meta.cover_url.is_none() {
                if let Some(isbn) = meta.isbn.clone() {
                    if has_cookie {
                        if let Ok(db) = douban::fetch(&isbn, douban_cookie).await {
                            if db.cover_url.is_some() { meta.cover_url = db.cover_url; }
                            if meta.author.is_none() { meta.author = db.author; }
                            if meta.publisher.is_none() { meta.publisher = db.publisher; }
                        }
                    }
                }
            }
            eprintln!("[enrich] {:?} → google ok (cover={} isbn={:?})",
                title, meta.cover_url.is_some(), meta.isbn);
            return meta;
        }
        Ok(_) => eprintln!("[enrich] {:?} → google empty", title),
        Err(e) => eprintln!("[enrich] {:?} → google err: {}", title, e),
    }

    // Try Open Library
    match open_library::search_by_title_author(title, author).await {
        Ok(meta) if meta.title.is_some() => {
            eprintln!("[enrich] {:?} → openlibrary ok (cover={} isbn={:?})",
                title, meta.cover_url.is_some(), meta.isbn);
            return meta;
        }
        Ok(_) => eprintln!("[enrich] {:?} → openlibrary empty", title),
        Err(e) => eprintln!("[enrich] {:?} → openlibrary err: {}", title, e),
    }

    eprintln!("[enrich] {:?} → all sources failed, using LLM fallback", title);
    BookMeta {
        title: Some(title.to_string()),
        author: if author.is_empty() { None } else { Some(author.to_string()) },
        ..Default::default()
    }
}

/// 豆瓣无封面时，从 Google Books / Open Library 补封面
async fn fallback_cover(isbn: &str, google_api_key: Option<&str>) -> Option<String> {
    if let Ok(meta) = google_books::fetch(isbn, google_api_key).await {
        if meta.cover_url.is_some() { return meta.cover_url; }
    }
    open_library::fetch(isbn).await.ok().and_then(|m| m.cover_url)
}

pub async fn fetch_by_isbn(isbn: &str, source: Option<&str>, google_api_key: Option<&str>, douban_cookie: Option<&str>) -> Result<BookMeta> {
    let has_data = |meta: &BookMeta| meta.title.is_some() || meta.publisher.is_some() || meta.isbn.is_some();
    let fetch_single = |meta: BookMeta, name: &str| -> Result<BookMeta> {
        if has_data(&meta) { Ok(meta) } else { Err(anyhow!("{} 未找到该书", name)) }
    };

    match source {
        Some("douban") => fetch_single(douban::fetch(isbn, douban_cookie).await?, "豆瓣"),
        Some("goodreads") => fetch_single(goodreads::fetch_book(isbn).await?, "Goodreads"),
        Some("google") => fetch_single(google_books::fetch(isbn, google_api_key).await?, "Google Books"),
        Some("openlibrary") => fetch_single(open_library::fetch(isbn).await?, "Open Library"),
        _ => {
            match douban::fetch(isbn, douban_cookie).await {
                Ok(mut meta) if has_data(&meta) => {
                    if meta.cover_url.is_none() {
                        meta.cover_url = fallback_cover(isbn, google_api_key).await;
                    }
                    return Ok(meta);
                }
                Err(e) if matches!(e.downcast_ref::<SourceError>(), Some(SourceError::CookieExpired)) => return Err(e),
                _ => {}
            }
            if let Ok(meta) = google_books::fetch(isbn, google_api_key).await {
                if meta.title.is_some() { return Ok(meta); }
            }
            if let Ok(meta) = open_library::fetch(isbn).await {
                if meta.title.is_some() { return Ok(meta); }
            }
            Err(anyhow!("未找到 ISBN {} 对应的书籍信息", isbn))
        }
    }
}
