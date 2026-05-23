use super::BookMeta;
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
struct BookEntry {
    title: Option<String>,
    authors: Option<Vec<NamedValue>>,
    publishers: Option<Vec<NamedValue>>,
    publish_date: Option<String>,
    description: Option<DescriptionValue>,
    languages: Option<Vec<LanguageRef>>,
    subjects: Option<Vec<NamedValue>>,
    cover: Option<Cover>,
}

#[derive(Deserialize)]
struct NamedValue {
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum DescriptionValue {
    Simple(String),
    Object { value: String },
}

#[derive(Deserialize)]
struct LanguageRef {
    key: Option<String>,
}

#[derive(Deserialize)]
struct Cover {
    large: Option<String>,
    medium: Option<String>,
}

fn map_subject_to_category(subjects: &[NamedValue]) -> Option<String> {
    for s in subjects {
        let Some(name) = &s.name else { continue };
        let lower = name.to_lowercase();
        let mapped = if lower.contains("fiction") || lower.contains("novel") {
            "小说"
        } else if lower.contains("biograph") || lower.contains("memoir") || lower.contains("autobiograph") {
            "传记"
        } else if lower.contains("histor") {
            "历史"
        } else if lower.contains("science") || lower.contains("technolog") || lower.contains("computer")
            || lower.contains("engineer") || lower.contains("mathemat") || lower.contains("physic")
            || lower.contains("chemistr") || lower.contains("biolog") || lower.contains("medic") {
            "科技"
        } else if lower.contains("philosoph") {
            "哲学"
        } else if lower.contains("psycholog") || lower.contains("social science") || lower.contains("sociology")
            || lower.contains("political") || lower.contains("self-help") || lower.contains("law") {
            "社科"
        } else if lower.contains("business") || lower.contains("econom") || lower.contains("financ")
            || lower.contains("management") || lower.contains("marketing") {
            "经济"
        } else if lower.contains("art") || lower.contains("music") || lower.contains("design")
            || lower.contains("photograph") || lower.contains("architect") {
            "艺术"
        } else if lower.contains("literatur") || lower.contains("language") || lower.contains("rhetoric")
            || lower.contains("poetry") || lower.contains("writing") || lower.contains("prose") {
            "文学"
        } else {
            continue;
        };
        return Some(mapped.to_string());
    }
    None
}

pub async fn search_by_title_author(title: &str, author: &str) -> Result<BookMeta> {
    use url::form_urlencoded;
    #[derive(serde::Deserialize)]
    struct SearchResponse { docs: Vec<SearchDoc> }
    #[derive(serde::Deserialize)]
    struct SearchDoc {
        title: Option<String>,
        author_name: Option<Vec<String>>,
        isbn: Option<Vec<String>>,
        cover_i: Option<i64>,
        publisher: Option<Vec<String>>,
        first_publish_year: Option<i64>,
        subject: Option<Vec<String>>,
    }

    let t_enc: String = form_urlencoded::byte_serialize(title.as_bytes()).collect();
    let a_enc: String = form_urlencoded::byte_serialize(author.as_bytes()).collect();
    let url = if author.is_empty() {
        format!("https://openlibrary.org/search.json?title={}&limit=1", t_enc)
    } else {
        format!("https://openlibrary.org/search.json?title={}&author={}&limit=1", t_enc, a_enc)
    };

    let resp: SearchResponse = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?
        .get(&url)
        .send()
        .await?
        .json()
        .await?;

    let Some(doc) = resp.docs.into_iter().next() else {
        return Ok(BookMeta::default());
    };

    // If we have an ISBN, fetch full data for richer metadata
    if let Some(isbn) = doc.isbn.as_ref().and_then(|v| v.first()) {
        if let Ok(meta) = fetch(isbn).await {
            if meta.title.is_some() {
                return Ok(meta);
            }
        }
    }

    // Otherwise construct from search doc fields
    let subjects: Vec<NamedValue> = doc
        .subject
        .unwrap_or_default()
        .into_iter()
        .map(|s| NamedValue { name: Some(s) })
        .collect();

    Ok(BookMeta {
        title: doc.title,
        author: doc.author_name.map(|a| a.join(", ")).filter(|s| !s.is_empty()),
        cover_url: doc.cover_i.map(|id| {
            format!("https://covers.openlibrary.org/b/id/{}-L.jpg", id)
        }),
        publisher: doc.publisher.and_then(|v| v.into_iter().next()),
        pub_date: doc.first_publish_year.map(|y| y.to_string()),
        category: map_subject_to_category(&subjects),
        translator: None,
        region: None,
        isbn: None,
        description: None,
        language: None,
        rating: None,
        series: None,
    })
}

pub async fn fetch(isbn: &str) -> Result<BookMeta> {
    let url = format!(
        "https://openlibrary.org/api/books?bibkeys=ISBN:{}&format=json&jscmd=data",
        isbn
    );
    let map: HashMap<String, BookEntry> = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()?
        .get(&url)
        .send()
        .await?
        .json()
        .await?;

    let Some(entry) = map.into_values().next() else {
        return Ok(BookMeta::default());
    };

    let author = entry.authors.as_ref().map(|authors| {
        authors.iter()
            .filter_map(|a| a.name.as_deref())
            .collect::<Vec<_>>()
            .join(", ")
    }).filter(|s| !s.is_empty());

    let publisher = entry.publishers.as_ref()
        .and_then(|p| p.first())
        .and_then(|p| p.name.clone());

    let pub_date = entry.publish_date.as_deref().and_then(super::normalize_date);

    let description = entry.description.map(|d| match d {
        DescriptionValue::Simple(s) => s,
        DescriptionValue::Object { value } => value,
    });

    // Prefer API-provided cover URL; fall back to ISBN-based URL
    let cover_url = entry.cover
        .and_then(|c| c.large.or(c.medium))
        .or_else(|| Some(format!("https://covers.openlibrary.org/b/isbn/{}-L.jpg", isbn)));

    let language = entry.languages.as_ref()
        .and_then(|l| l.first())
        .and_then(|l| l.key.as_deref())
        .map(|k| match k.trim_start_matches("/languages/") {
            "chi" | "zho" | "cmn" => "中文",
            "eng"                 => "English",
            "jpn"                 => "日本語",
            _                     => "其他",
        }.to_string());

    let category = entry.subjects.as_deref().and_then(map_subject_to_category);

    Ok(BookMeta {
        title: entry.title,
        author,
        translator: None,
        region: None,
        category,
        publisher,
        pub_date,
        cover_url,
        description,
        language,
        isbn: Some(isbn.to_string()),
        rating: None,
        series: None,
    })
}
