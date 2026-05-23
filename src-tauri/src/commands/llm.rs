use crate::config::load;
use crate::db::DbState;
use crate::isbn;
use crate::llm::{call_claude, extract_json_array, extract_json_object};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

/// Keep in sync with CATEGORIES in src/types/book.ts
const CATEGORIES: &[&str] = &[
    "小说", "文学", "散文", "诗歌", "历史", "古籍", "哲学", "宗教", "心理", "社科",
    "政治", "经济", "市场", "管理", "自然科学", "数学", "物理", "计算机", "医学",
    "科普", "建筑", "传记", "艺术", "设计", "音乐", "漫画", "语言", "生活", "军事", "其他",
];

#[derive(Debug, Serialize, Deserialize)]
pub struct BookRecommendation {
    pub id: i64,
    pub score: f64,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MetadataSuggestion {
    pub category: Option<String>,
    pub region: Option<String>,
    pub tags: Vec<String>,
}

/// A want-to-read book entry sent to the LLM.
#[derive(Serialize)]
struct WantBook {
    id: i64,
    title: String,
    author: String,
    category: String,
    region: String,
}

struct RatedBook {
    title: String,
    author: String,
    category: String,
    region: String,
    rating: i64,
}

#[tauri::command]
pub async fn recommend_books(
    state: State<'_, DbState>,
) -> Result<Vec<BookRecommendation>, String> {
    let cfg = load();

    // Collect all data from DB before any await point.
    let (rated_lines, cats_str, regions_str, tags_str, want_books) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;

        // Actual high-rated books (up to 50, ordered by rating desc then recency)
        let mut stmt = conn
            .prepare(
                "SELECT title, author, category, region, rating FROM books \
                 WHERE rating >= 4 ORDER BY rating DESC, created_at DESC LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let rated: Vec<RatedBook> = stmt
            .query_map([], |r| {
                Ok(RatedBook {
                    title: r.get::<_, String>(0)?,
                    author: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    category: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    region: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    rating: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let lines: Vec<String> = rated
            .iter()
            .map(|b| {
                format!(
                    "《{}》{} [{}/{}] {}",
                    b.title,
                    b.author,
                    b.category,
                    b.region,
                    "★".repeat(b.rating as usize),
                )
            })
            .collect();

        // Category distribution from high-rated books
        let mut stmt = conn
            .prepare(
                "SELECT category, COUNT(*) FROM books \
                 WHERE rating >= 4 AND category IS NOT NULL AND category != '' \
                 GROUP BY category ORDER BY COUNT(*) DESC",
            )
            .map_err(|e| e.to_string())?;
        let cats: Vec<String> = stmt
            .query_map([], |r| {
                Ok(format!("{}({})", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // Region distribution from high-rated books
        let mut stmt = conn
            .prepare(
                "SELECT region, COUNT(*) FROM books \
                 WHERE rating >= 4 AND region IS NOT NULL AND region != '' \
                 GROUP BY region ORDER BY COUNT(*) DESC",
            )
            .map_err(|e| e.to_string())?;
        let regions: Vec<String> = stmt
            .query_map([], |r| {
                Ok(format!("{}({})", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        // Top tags from high-rated books
        let mut stmt = conn
            .prepare(
                "SELECT tags FROM books \
                 WHERE rating >= 4 AND tags IS NOT NULL AND tags NOT IN ('', '[]')",
            )
            .map_err(|e| e.to_string())?;
        let tags_raw: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut tag_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for raw in &tags_raw {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(raw) {
                for tag in tags {
                    *tag_counts.entry(tag).or_insert(0) += 1;
                }
            }
        }
        let mut top_tags: Vec<(String, usize)> = tag_counts.into_iter().collect();
        top_tags.sort_by(|a, b| b.1.cmp(&a.1));
        top_tags.truncate(15);
        let tags: Vec<String> = top_tags.into_iter().map(|(t, _)| t).collect();

        // Want-to-read books
        let mut stmt = conn
            .prepare(
                "SELECT id, title, author, category, region FROM books \
                 WHERE status = 'want' ORDER BY created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let want: Vec<WantBook> = stmt
            .query_map([], |r| {
                Ok(WantBook {
                    id: r.get(0)?,
                    title: r.get::<_, String>(1)?,
                    author: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    category: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    region: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        (
            lines,
            if cats.is_empty() { "暂无数据".to_string() } else { cats.join("、") },
            if regions.is_empty() { "暂无数据".to_string() } else { regions.join("、") },
            if tags.is_empty() { "暂无数据".to_string() } else { tags.join("、") },
            want,
        )
    };

    if want_books.is_empty() {
        return Ok(vec![]);
    }

    let want_json = serde_json::to_string(&want_books).map_err(|e| e.to_string())?;

    let rated_section = if rated_lines.is_empty() {
        "暂无高分藏书".to_string()
    } else {
        rated_lines.join("\n")
    };

    let prompt = format!(
        "你是一位私人图书馆顾问，请根据用户的阅读偏好，对「想读」书单进行推荐排序。\n\n\
         **用户高分藏书（4-5 星，共 {rated_n} 本）：**\n\
         {rated}\n\n\
         **偏好统计：**\n\
         类别：{cats}\n\
         地域：{regions}\n\
         常见标签：{tags}\n\n\
         **「想读」书单（共 {n} 本）：**\n\
         {want}\n\n\
         请综合用户的具体藏书品味与偏好统计，对每本「想读」书打分（0.0-10.0，精确到0.1），\
         评估与用户偏好的匹配度，并给出不超过25字的推荐理由。\n\
         只返回JSON数组，不要其他文字：\n\
         [{{\"id\": 1, \"score\": 8.5, \"reason\": \"推荐理由\"}}]",
        rated_n = rated_lines.len(),
        rated = rated_section,
        cats = cats_str,
        regions = regions_str,
        tags = tags_str,
        n = want_books.len(),
        want = want_json,
    );

    let response = call_claude(&prompt, &cfg).await.map_err(|e| e.to_string())?;

    let json_str = extract_json_array(&response).to_string();
    let mut recs: Vec<BookRecommendation> = serde_json::from_str(&json_str)
        .map_err(|e| format!("解析推荐结果失败: {e}"))?;

    recs.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(recs)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiscoveredBook {
    pub title: String,
    pub author: Option<String>,
    pub reason: String,
    pub cover_url: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub pub_date: Option<String>,
    pub language: Option<String>,
    pub category: Option<String>,
    pub region: Option<String>,
    pub description: Option<String>,
}

#[derive(Deserialize)]
struct LlmDiscovery {
    title: String,
    author: Option<String>,
    reason: String,
}

/// Normalize a book title for deduplication (Plan B):
/// 1. Strip subtitles after ：/ —— / : (keep only the main title)
/// 2. Strip parenthesized edition markers （增订版）(上)(精装版) etc.
/// 3. Strip book-title brackets 《》「」【】
/// 4. Convert full-width ASCII to half-width
/// 5. Lowercase and collapse whitespace
fn norm_title(s: &str) -> String {
    // Step 1: truncate at subtitle separators
    let s = s.split(['：', '—']).next().unwrap_or(s);
    let s = s.split(':').next().unwrap_or(s);

    // Step 2: strip parenthesized content (edition / volume markers)
    // Handles both ASCII () and full-width （）
    let mut result = String::with_capacity(s.len());
    let mut depth_ascii = 0u32;
    let mut depth_full = 0u32;
    for c in s.chars() {
        match c {
            '(' => { depth_ascii += 1; }
            ')' => { depth_ascii = depth_ascii.saturating_sub(1); }
            '（' => { depth_full += 1; }
            '）' => { depth_full = depth_full.saturating_sub(1); }
            _ if depth_ascii == 0 && depth_full == 0 => result.push(c),
            _ => {}
        }
    }

    // Steps 3-5: strip brackets, full-width→half-width, lowercase, collapse spaces
    result.chars()
        .filter(|c| !matches!(c, '《' | '》' | '「' | '」' | '【' | '】'))
        .map(|c| {
            if ('\u{FF01}'..='\u{FF5E}').contains(&c) {
                char::from_u32(c as u32 - 0xFEE0).unwrap_or(c)
            } else {
                c
            }
        })
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

const FUZZY_THRESHOLD: f64 = 0.85;

#[tauri::command]
pub async fn discover_books(
    state: State<'_, DbState>,
    app: tauri::AppHandle,
) -> Result<Vec<DiscoveredBook>, String> {
    let cfg = load();
    const TARGET: usize = 5;
    const MAX_ROUNDS: usize = 3;

    let (rated_lines, cats_str, regions_str, tags_str, existing_titles) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT title, author, category, region, rating FROM books \
                 WHERE rating >= 4 ORDER BY rating DESC, created_at DESC LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let rated: Vec<RatedBook> = stmt
            .query_map([], |r| {
                Ok(RatedBook {
                    title: r.get::<_, String>(0)?,
                    author: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    category: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    region: r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    rating: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let lines: Vec<String> = rated
            .iter()
            .map(|b| {
                format!(
                    "《{}》{} [{}/{}] {}",
                    b.title, b.author, b.category, b.region,
                    "★".repeat(b.rating as usize),
                )
            })
            .collect();

        let mut stmt = conn
            .prepare(
                "SELECT category, COUNT(*) FROM books \
                 WHERE rating >= 4 AND category IS NOT NULL AND category != '' \
                 GROUP BY category ORDER BY COUNT(*) DESC",
            )
            .map_err(|e| e.to_string())?;
        let cats: Vec<String> = stmt
            .query_map([], |r| {
                Ok(format!("{}({})", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt = conn
            .prepare(
                "SELECT region, COUNT(*) FROM books \
                 WHERE rating >= 4 AND region IS NOT NULL AND region != '' \
                 GROUP BY region ORDER BY COUNT(*) DESC",
            )
            .map_err(|e| e.to_string())?;
        let regions: Vec<String> = stmt
            .query_map([], |r| {
                Ok(format!("{}({})", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut stmt = conn
            .prepare(
                "SELECT tags FROM books \
                 WHERE rating >= 4 AND tags IS NOT NULL AND tags NOT IN ('', '[]')",
            )
            .map_err(|e| e.to_string())?;
        let tags_raw: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        let mut tag_counts: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        for raw in &tags_raw {
            if let Ok(tags) = serde_json::from_str::<Vec<String>>(raw) {
                for tag in tags {
                    *tag_counts.entry(tag).or_insert(0) += 1;
                }
            }
        }
        let mut top_tags: Vec<(String, usize)> = tag_counts.into_iter().collect();
        top_tags.sort_by(|a, b| b.1.cmp(&a.1));
        top_tags.truncate(15);
        let tags: Vec<String> = top_tags.into_iter().map(|(t, _)| t).collect();

        let mut stmt = conn
            .prepare("SELECT title FROM books WHERE title IS NOT NULL AND title != ''")
            .map_err(|e| e.to_string())?;
        let titles: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        (
            lines,
            if cats.is_empty() { "暂无数据".to_string() } else { cats.join("、") },
            if regions.is_empty() { "暂无数据".to_string() } else { regions.join("、") },
            if tags.is_empty() { "暂无数据".to_string() } else { tags.join("、") },
            titles,
        )
    };

    let existing_norm_vec: Vec<String> =
        existing_titles.iter().map(|t| norm_title(t)).collect();
    let existing_norm: std::collections::HashSet<String> =
        existing_norm_vec.iter().cloned().collect();

    let rated_section = if rated_lines.is_empty() {
        "暂无高分藏书".to_string()
    } else {
        rated_lines.join("\n")
    };

    let mut results: Vec<LlmDiscovery> = Vec::new();
    let mut all_suggested: Vec<String> = Vec::new();

    app.emit("discover_progress", "正在分析藏书偏好…").ok();

    for round in 0..MAX_ROUNDS {
        if results.len() >= TARGET { break; }

        let n_request = if round == 0 { 10usize } else { 8usize };
        let exclude_clause = if all_suggested.is_empty() {
            String::new()
        } else {
            format!(
                "请不要重复推荐以下书籍：{}\n",
                all_suggested.iter().map(|t| format!("《{}》", t)).collect::<Vec<_>>().join("")
            )
        };

        let progress_msg = if round == 0 {
            "AI 正在生成推荐书单…".to_string()
        } else {
            format!("推荐不足，AI 正在补充（第 {} 轮）…", round + 1)
        };
        app.emit("discover_progress", progress_msg).ok();

        let prompt = format!(
            "你是一位私人图书馆顾问。请基于用户的阅读偏好，推荐{n}本用户可能感兴趣的好书。\n\n\
             **用户高分藏书（4-5星，共{rated_n}本）：**\n{rated}\n\n\
             **偏好统计：**\n类别：{cats}\n地域：{regions}\n常见标签：{tags}\n\n\
             用户现有藏书共 {total} 本。{exclude}\
             请推荐该类型读者通常会感兴趣但不一定拥有的书。\n\
             给出书名、作者和不超过30字的推荐理由。\n\
             只返回JSON数组，不要其他文字：\n\
             [{{\"title\": \"书名\", \"author\": \"作者\", \"reason\": \"推荐理由\"}}]",
            n = n_request,
            rated_n = rated_lines.len(),
            rated = rated_section,
            cats = cats_str,
            regions = regions_str,
            tags = tags_str,
            total = existing_titles.len(),
            exclude = exclude_clause,
        );

        let response = call_claude(&prompt, &cfg).await.map_err(|e| e.to_string())?;
        app.emit("discover_progress", "去重过滤中…").ok();
        let json_str = extract_json_array(&response).to_string();
        let candidates: Vec<LlmDiscovery> =
            serde_json::from_str(&json_str).unwrap_or_default();

        for c in &candidates {
            all_suggested.push(c.title.clone());
        }

        let accepted_norm_vec: Vec<String> =
            results.iter().map(|c| norm_title(&c.title)).collect();
        let accepted_norm: std::collections::HashSet<String> =
            accepted_norm_vec.iter().cloned().collect();
        for c in candidates {
            let cn = norm_title(&c.title);
            if existing_norm.contains(&cn) || accepted_norm.contains(&cn) {
                eprintln!("[dedup] exact   「{}」(norm={})", c.title, cn);
            } else if let Some(hit) = existing_norm_vec.iter().chain(accepted_norm_vec.iter())
                .find(|e| strsim::jaro_winkler(&cn, e) >= FUZZY_THRESHOLD)
            {
                eprintln!("[dedup] fuzzy   「{}」≈「{}」(score={:.2})",
                    c.title, hit, strsim::jaro_winkler(&cn, hit));
            } else {
                eprintln!("[dedup] pass    「{}」", c.title);
                results.push(c);
                if results.len() >= TARGET { break; }
            }
        }
    }

    let out = results
        .into_iter()
        .take(TARGET)
        .map(|c| DiscoveredBook {
            title: c.title,
            author: c.author,
            reason: c.reason,
            cover_url: None,
            isbn: None,
            publisher: None,
            pub_date: None,
            language: None,
            category: None,
            region: None,
            description: None,
        })
        .collect();

    Ok(out)
}

#[tauri::command]
pub async fn enrich_book(title: String, author: String) -> Result<DiscoveredBook, String> {
    let cfg = load();
    let meta = isbn::discover_search(
        &title,
        &author,
        cfg.google_books_api_key.as_deref(),
        cfg.douban_cookie.as_deref(),
    )
    .await;

    Ok(DiscoveredBook {
        title: meta.title.unwrap_or_else(|| title.clone()),
        author: meta.author.or_else(|| if author.is_empty() { None } else { Some(author) }),
        reason: String::new(),
        cover_url: meta.cover_url,
        isbn: meta.isbn,
        publisher: meta.publisher,
        pub_date: meta.pub_date,
        language: meta.language,
        category: meta.category,
        region: meta.region,
        description: meta.description,
    })
}

#[tauri::command]
pub async fn suggest_metadata(
    title: String,
    author: String,
    description: String,
) -> Result<MetadataSuggestion, String> {
    let cfg = load();

    let prompt = format!(
        "你是一位图书分类专家。根据以下书籍信息，推断合适的类别、地域和标签。\n\n\
         书名：{title}\n\
         作者：{author}\n\
         简介：{desc}\n\n\
         请从以下选项中选择：\n\
         类别（选一项，若无合适选项则留空）：\n\
         {cats}\n\n\
         地域（选一项，表示作者国籍或书籍主要背景地域，若无法确定则留空）：\n\
         中国、日本、美国、英国、法国、德国、俄罗斯、意大利、西班牙、希腊、奥地利、\
         加拿大、澳大利亚、韩国、印度、挪威、瑞典、瑞士、荷兰、比利时、捷克、波兰、\
         匈牙利、罗马尼亚、葡萄牙、丹麦、芬兰、哥伦比亚、阿根廷、巴西、墨西哥、\
         秘鲁、智利、爱尔兰、以色列、土耳其、埃及、南非、尼日利亚、白俄罗斯、\
         新西兰、新加坡、泰国、越南、缅甸、巴基斯坦\n\n\
         标签（0-5个关键词，用中文，简短精炼）\n\n\
         只返回JSON，不要其他文字：\n\
         {{\"category\": \"历史\", \"region\": \"中国\", \"tags\": [\"近现代\", \"政治史\"]}}",
        title = title,
        author = if author.is_empty() { "未知".to_string() } else { author },
        desc = if description.is_empty() { "（无简介）".to_string() } else { description },
        cats = CATEGORIES.join("、"),
    );

    let response = call_claude(&prompt, &cfg).await.map_err(|e| e.to_string())?;

    let json_str = extract_json_object(&response).to_string();
    let suggestion: MetadataSuggestion =
        serde_json::from_str(&json_str).map_err(|e| format!("解析建议失败: {e}"))?;

    Ok(suggestion)
}
