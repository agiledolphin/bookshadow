use super::douban::NewBookEntry;
use super::BookMeta;
use anyhow::{anyhow, Result};
use scraper::{Html, Selector};

pub async fn fetch_new_books(pages: u32) -> Result<Vec<NewBookEntry>> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let mut results = Vec::new();

    for page in 1..=pages {
        let url = if page == 1 {
            "https://www.goodreads.com/shelf/show/new-releases".to_string()
        } else {
            format!("https://www.goodreads.com/shelf/show/new-releases?page={}", page)
        };

        let resp = client
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", "https://www.goodreads.com/")
            .send()
            .await?;

        let html = resp.text().await?;
        let entries = parse_html(&html);
        eprintln!("[goodreads] page {} → {} books", page, entries.len());
        if entries.is_empty() { break; }
        results.extend(entries);

        if page < pages {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        }
    }

    Ok(results)
}

fn parse_html(html: &str) -> Vec<NewBookEntry> {
    let document = Html::parse_document(html);

    let container_sel = Selector::parse("div.elementList").unwrap();
    let title_sel     = Selector::parse("a.bookTitle").unwrap();
    let author_sel    = Selector::parse("a.authorName span[itemprop='name']").unwrap();
    let cover_sel     = Selector::parse("div.left img").unwrap();
    let meta_sel      = Selector::parse("span.greyText.smallText").unwrap();

    let mut entries = Vec::new();

    for el in document.select(&container_sel) {
        let Some(title_el) = el.select(&title_sel).next() else { continue };

        let title = title_el.text().collect::<String>().trim().to_string();
        if title.is_empty() { continue }

        let href = title_el.value().attr("href").unwrap_or("");
        let Some(gr_id) = extract_id(href) else { continue };

        let author = el.select(&author_sel).next()
            .map(|a| a.text().collect::<String>().trim().to_string())
            .filter(|s| !s.is_empty());

        let cover_url = el.select(&cover_sel).next()
            .and_then(|img| img.value().attr("src"))
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty() && !s.contains("no_photo"));

        let pub_date = el.select(&meta_sel).next()
            .map(|s| s.text().collect::<String>())
            .and_then(|text| {
                text.split("published").nth(1)
                    .map(|s| s.trim().chars().take(4).collect::<String>())
                    .filter(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_digit()))
            });

        entries.push(NewBookEntry { title, author, subject_id: gr_id, cover_url, pub_date });
    }

    entries
}

fn extract_id(href: &str) -> Option<String> {
    // href: "/book/show/216815055-the-ballad-..."
    let after = href.split("/book/show/").nth(1)?;
    let id: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    if id.is_empty() { None } else { Some(id) }
}

pub async fn fetch_book(isbn: &str) -> Result<BookMeta> {
    let url = format!("https://www.goodreads.com/book/isbn/{}", isbn.trim());

    // Non-browser UA bypasses the AWS WAF JS challenge that blocks browser-mimicking clients.
    let client = reqwest::Client::builder()
        .user_agent("BookShadow/0.9")
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let resp = client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(anyhow!(
            "Goodreads 单本查询暂时不可用（HTTP {}，可能被反爬拦截），请尝试其他来源",
            resp.status().as_u16()
        ));
    }

    let html = resp.text().await?;
    parse_book_page(&html, isbn)
}

fn parse_book_page(html: &str, isbn: &str) -> Result<BookMeta> {
    let json_ld = if let Some(start) = html.find("application/ld+json") {
        let after = &html[start..];
        if let Some(open) = after.find('>') {
            let content = &after[open + 1..];
            if let Some(close) = content.find("</script>") {
                content[..close].to_string()
            } else { String::new() }
        } else { String::new() }
    } else { String::new() };

    if json_ld.is_empty() {
        return Err(anyhow!(
            "Goodreads 单本查询暂时不可用（页面被反爬验证拦截），请尝试其他来源"
        ));
    }

    let v: serde_json::Value = serde_json::from_str(&json_ld)
        .map_err(|e| anyhow!("Goodreads JSON-LD 解析失败: {}", e))?;

    let raw_name = v["name"].as_str().unwrap_or("").trim().to_string();
    if raw_name.is_empty() {
        return Err(anyhow!("Goodreads: ISBN {} 的结构化数据中未找到书名", isbn));
    }

    let (title, series) = parse_title_series(&raw_name);

    let author = v["author"].as_array()
        .and_then(|arr| arr.first())
        .and_then(|a| a["name"].as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let cover_url = v["image"].as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let isbn_val = v["isbn"].as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| Some(isbn.to_string()));

    let language = v["inLanguage"].as_str()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let goodreads_rating = v["aggregateRating"]["ratingValue"]
        .as_f64()
        .filter(|&r| r > 0.0);

    let next = extract_next_data(html);

    Ok(BookMeta {
        title: Some(title),
        author,
        cover_url,
        isbn: isbn_val,
        language,
        series,
        description: next.description,
        publisher: next.publisher,
        pub_date: next.pub_date,
        goodreads_rating,
        ..Default::default()
    })
}

fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
     .replace("&quot;", "\"")
     .replace("&#x27;", "'")
     .replace("&#39;", "'")
     .replace("&lt;", "<")
     .replace("&gt;", ">")
}

fn strip_tags(s: &str) -> String {
    let decoded = html_decode(s);
    let mut out = String::with_capacity(decoded.len());
    let mut in_tag = false;
    for c in decoded.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            '\n' | '\r' if !in_tag => out.push(c),
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    // Collapse runs of whitespace while preserving paragraph breaks
    out.trim().to_string()
}

struct NextDataBook {
    description: Option<String>,
    publisher: Option<String>,
    pub_date: Option<String>,
}

fn find_next_data_book(v: &serde_json::Value) -> Option<NextDataBook> {
    match v {
        serde_json::Value::Object(map) => {
            let has_title = map.contains_key("title")
                || map.contains_key("titleText")
                || map.contains_key("bookTitleBare");
            if has_title {
                // Prefer Goodreads' own pre-stripped description over our HTML stripping
                let description = map.get("description({\"stripped\":true})")
                    .and_then(|d| d.as_str())
                    .map(|s| s.trim().to_string())
                    .or_else(|| {
                        map.get("description")
                            .and_then(|d| d.as_str())
                            .map(strip_tags)
                    })
                    .filter(|s| s.len() > 20)
                    .map(|s| s.chars().take(2000).collect());

                let details = map.get("details");
                let publisher = details
                    .and_then(|d| d.get("publisher"))
                    .and_then(|p| p.as_str())
                    .filter(|s| !s.is_empty())
                    .map(html_decode);
                let pub_date = details
                    .and_then(|d| d.get("publicationTime"))
                    .and_then(|t| t.as_i64())
                    .and_then(|ts_ms| {
                        use chrono::TimeZone;
                        chrono::Utc.timestamp_opt(ts_ms / 1000, 0).single()
                            .map(|dt| dt.format("%Y-%m-%d").to_string())
                    });

                if description.is_some() || publisher.is_some() || pub_date.is_some() {
                    return Some(NextDataBook { description, publisher, pub_date });
                }
            }
            for val in map.values() {
                if let Some(b) = find_next_data_book(val) { return Some(b); }
            }
            None
        }
        serde_json::Value::Array(arr) => {
            for val in arr {
                if let Some(b) = find_next_data_book(val) { return Some(b); }
            }
            None
        }
        _ => None,
    }
}

fn extract_next_data(html: &str) -> NextDataBook {
    let extract = || -> Option<NextDataBook> {
        let start = html.find("id=\"__NEXT_DATA__\"")?;
        let after = &html[start..];
        let open = after.find('>')?;
        let content = &after[open + 1..];
        let close = content.find("</script>")?;
        let v: serde_json::Value = serde_json::from_str(&content[..close]).ok()?;
        find_next_data_book(&v)
    };
    extract().unwrap_or(NextDataBook { description: None, publisher: None, pub_date: None })
}

fn parse_title_series(raw: &str) -> (String, Option<String>) {
    // "A Time for Mercy (Jake Brigance, #3)" → ("A Time for Mercy", Some("Jake Brigance #3"))
    if raw.ends_with(')') {
        if let Some(paren_start) = raw.rfind(" (") {
            let inner = &raw[paren_start + 2..raw.len() - 1];
            if inner.contains('#') {
                let title = raw[..paren_start].trim().to_string();
                let series = inner.replace(", #", " #").trim().to_string();
                return (title, Some(series));
            }
        }
    }
    (raw.trim().to_string(), None)
}
