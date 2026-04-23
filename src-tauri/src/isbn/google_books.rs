use super::BookMeta;
use anyhow::Result;
use serde::Deserialize;

#[derive(Deserialize)]
struct Response {
    items: Option<Vec<Item>>,
}

#[derive(Deserialize)]
struct Item {
    #[serde(rename = "volumeInfo")]
    volume_info: VolumeInfo,
}

#[derive(Deserialize)]
struct VolumeInfo {
    title: Option<String>,
    authors: Option<Vec<String>>,
    publisher: Option<String>,
    #[serde(rename = "publishedDate")]
    published_date: Option<String>,
    description: Option<String>,
    language: Option<String>,
    categories: Option<Vec<String>>,
    #[serde(rename = "imageLinks")]
    image_links: Option<ImageLinks>,
    #[serde(rename = "industryIdentifiers")]
    industry_identifiers: Option<Vec<Identifier>>,
}

#[derive(Deserialize)]
struct ImageLinks {
    thumbnail: Option<String>,
}

#[derive(Deserialize)]
struct Identifier {
    #[serde(rename = "type")]
    id_type: String,
    identifier: String,
}

fn map_language(code: &str) -> &'static str {
    match code {
        "zh" | "zh-hans" | "zh-hant" => "中文",
        "en"                          => "English",
        "ja"                          => "日本語",
        _                             => "其他",
    }
}

fn map_category(cats: &[String]) -> Option<String> {
    for cat in cats {
        let lower = cat.to_lowercase();
        let mapped = if lower.contains("fiction") || lower.contains("novel")
            || lower.contains("thriller") || lower.contains("mystery")
            || lower.contains("romance") || lower.contains("horror")
            || lower.contains("fantasy") || lower.contains("short stor") {
            "小说"
        } else if lower.contains("biograph") || lower.contains("memoir")
            || lower.contains("autobiograph") {
            "传记"
        } else if lower.contains("histor") {
            "历史"
        } else if lower.contains("science") || lower.contains("technolog")
            || lower.contains("computer") || lower.contains("engineer")
            || lower.contains("mathemat") || lower.contains("physic")
            || lower.contains("chemistr") || lower.contains("biolog")
            || lower.contains("medic") || lower.contains("natur") {
            "科技"
        } else if lower.contains("philosoph") {
            "哲学"
        } else if lower.contains("psycholog") || lower.contains("social science")
            || lower.contains("sociology") || lower.contains("political")
            || lower.contains("self-help") || lower.contains("self help")
            || lower.contains("law") || lower.contains("education") {
            "社科"
        } else if lower.contains("business") || lower.contains("econom")
            || lower.contains("financ") || lower.contains("management")
            || lower.contains("investing") || lower.contains("marketing") {
            "经济"
        } else if lower.contains("art") || lower.contains("music")
            || lower.contains("design") || lower.contains("photograph")
            || lower.contains("architect") || lower.contains("perform") {
            "艺术"
        } else if lower.contains("literary") || lower.contains("literature")
            || lower.contains("language arts") || lower.contains("poetry")
            || lower.contains("drama") || lower.contains("writing")
            || lower.contains("rhetoric") || lower.contains("reference") {
            "文学"
        } else {
            continue;
        };
        return Some(mapped.to_string());
    }
    // 有分类但映射不上，填"其他"
    if !cats.is_empty() { Some("其他".to_string()) } else { None }
}

pub async fn fetch(isbn: &str, api_key: Option<&str>) -> Result<BookMeta> {
    let mut url = format!(
        "https://www.googleapis.com/books/v1/volumes?q=isbn:{}",
        isbn
    );
    if let Some(key) = api_key {
        if !key.is_empty() {
            url.push_str("&key=");
            url.push_str(key);
        }
    }
    let http_resp = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?
        .get(&url)
        .send()
        .await?;
    let status = http_resp.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        anyhow::bail!("Google Books API 请求频率超限，请配置 API Key 或稍后重试");
    }
    if !status.is_success() {
        anyhow::bail!("Google Books API 返回错误: {}", status);
    }
    let resp: Response = http_resp.json().await?;

    let item = resp.items.and_then(|mut v| v.drain(..).next());
    let Some(item) = item else {
        return Ok(BookMeta::default());
    };
    let vi = item.volume_info;

    let pub_date = vi.published_date.as_deref().and_then(super::normalize_date);

    let isbn_val = vi.industry_identifiers.as_ref().and_then(|ids| {
        ids.iter()
            .find(|i| i.id_type == "ISBN_13")
            .or_else(|| ids.iter().find(|i| i.id_type == "ISBN_10"))
            .map(|i| i.identifier.clone())
    });

    let language = vi.language.as_deref().map(map_language).map(str::to_string);
    let category = vi.categories.as_deref().and_then(map_category);

    // Google Books thumbnail URLs use http:// — upgrade to https to avoid mixed-content issues
    let cover_url = vi.image_links
        .and_then(|l| l.thumbnail)
        .map(|u| u.replacen("http://", "https://", 1));

    Ok(BookMeta {
        title: vi.title,
        author: vi.authors.map(|a| a.join(", ")),
        translator: None,
        region: None,
        publisher: vi.publisher,
        pub_date,
        cover_url,
        description: vi.description,
        language,
        category,
        isbn: isbn_val.or_else(|| Some(isbn.to_string())),
        rating: None,
    })
}
