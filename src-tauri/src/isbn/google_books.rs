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
        } else if lower.contains("philosoph") {
            "哲学"
        } else if lower.contains("religion") || lower.contains("spiritual")
            || lower.contains("theology") || lower.contains("buddhis")
            || lower.contains("islam") || lower.contains("christianit") {
            "宗教"
        } else if lower.contains("psycholog") {
            "心理"
        } else if lower.contains("political") || lower.contains("politics") {
            "政治"
        } else if lower.contains("military") || lower.contains("war") {
            "军事"
        } else if lower.contains("computer") || lower.contains("software")
            || lower.contains("programming") || lower.contains("technolog")
            || lower.contains("engineer") {
            "计算机"
        } else if lower.contains("mathemat") {
            "数学"
        } else if lower.contains("physic") {
            "物理"
        } else if lower.contains("medic") || lower.contains("health") {
            "医学"
        } else if lower.contains("popular science") || lower.contains("science for")
            || lower.contains("popular") {
            "科普"
        } else if lower.contains("natur") || lower.contains("biolog")
            || lower.contains("chemistr") || lower.contains("astronom")
            || lower.contains("science") {
            "自然科学"
        } else if lower.contains("architect") {
            "建筑"
        } else if lower.contains("music") {
            "音乐"
        } else if lower.contains("design") {
            "设计"
        } else if lower.contains("art") || lower.contains("photograph")
            || lower.contains("perform") {
            "艺术"
        } else if lower.contains("comic") || lower.contains("manga")
            || lower.contains("graphic novel") {
            "漫画"
        } else if lower.contains("marketing") {
            "市场"
        } else if lower.contains("business") || lower.contains("econom")
            || lower.contains("financ") || lower.contains("management")
            || lower.contains("investing") {
            "经济"
        } else if lower.contains("social science") || lower.contains("sociology")
            || lower.contains("law") || lower.contains("education") {
            "社科"
        } else if lower.contains("cooking") || lower.contains("travel")
            || lower.contains("lifestyle") || lower.contains("sport")
            || lower.contains("self-help") || lower.contains("self help") {
            "生活"
        } else if lower.contains("poetry") {
            "诗歌"
        } else if lower.contains("language arts") || lower.contains("linguistics") {
            "语言"
        } else if lower.contains("literary") || lower.contains("literature")
            || lower.contains("drama") || lower.contains("writing")
            || lower.contains("rhetoric") {
            "文学"
        } else {
            continue;
        };
        return Some(mapped.to_string());
    }
    // 有分类但映射不上，填"其他"
    if !cats.is_empty() { Some("其他".to_string()) } else { None }
}

async fn fetch_url(url: &str) -> Result<BookMeta> {
    let http_resp = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?
        .get(url)
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
        publisher: vi.publisher,
        pub_date,
        cover_url,
        description: vi.description,
        language,
        category,
        isbn: isbn_val,
        ..Default::default()
    })
}

pub async fn fetch(isbn: &str, api_key: Option<&str>) -> Result<BookMeta> {
    let mut url = format!(
        "https://www.googleapis.com/books/v1/volumes?q=isbn:{}&maxResults=1",
        isbn
    );
    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        url.push_str("&key=");
        url.push_str(key);
    }
    let mut meta = fetch_url(&url).await?;
    // Preserve ISBN passed in if API didn't return one
    if meta.isbn.is_none() {
        meta.isbn = Some(isbn.to_string());
    }
    Ok(meta)
}

pub async fn search_by_title_author(title: &str, author: &str, api_key: Option<&str>) -> Result<BookMeta> {
    use url::form_urlencoded;
    let q = if author.is_empty() {
        form_urlencoded::byte_serialize(format!("intitle:{}", title).as_bytes()).collect::<String>()
    } else {
        form_urlencoded::byte_serialize(
            format!("intitle:{} inauthor:{}", title, author).as_bytes()
        ).collect::<String>()
    };
    let mut url = format!(
        "https://www.googleapis.com/books/v1/volumes?q={}&maxResults=1",
        q
    );
    if let Some(key) = api_key.filter(|k| !k.is_empty()) {
        url.push_str("&key=");
        url.push_str(key);
    }
    fetch_url(&url).await
}
