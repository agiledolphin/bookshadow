mod douban;
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
}

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

pub async fn fetch_by_isbn(isbn: &str, source: Option<&str>, google_api_key: Option<&str>, douban_cookie: Option<&str>) -> Result<BookMeta> {
    let fetch_single = |meta: BookMeta, name: &str| -> Result<BookMeta> {
        if meta.title.is_some() { Ok(meta) } else { Err(anyhow!("{} 未找到该书", name)) }
    };

    match source {
        Some("douban") => fetch_single(douban::fetch(isbn, douban_cookie).await?, "豆瓣"),
        Some("google") => fetch_single(google_books::fetch(isbn, google_api_key).await?, "Google Books"),
        Some("openlibrary") => fetch_single(open_library::fetch(isbn).await?, "Open Library"),
        _ => {
            if let Ok(meta) = douban::fetch(isbn, douban_cookie).await {
                if meta.title.is_some() { return Ok(meta); }
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
