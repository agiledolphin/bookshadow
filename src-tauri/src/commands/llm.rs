use crate::config::load;
use crate::db::DbState;
use crate::llm::{call_claude, extract_json_array, extract_json_object};
use serde::{Deserialize, Serialize};
use tauri::State;

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
         小说、文学、散文、诗歌、历史、古籍、哲学、宗教、心理、社科、政治、经济、市场、\
         自然科学、数学、物理、计算机、医学、科普、建筑、传记、艺术、设计、音乐、漫画、\
         语言、生活、军事、其他\n\n\
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
        desc = if description.is_empty() {
            "（无简介）".to_string()
        } else {
            description
        },
    );

    let response = call_claude(&prompt, &cfg).await.map_err(|e| e.to_string())?;

    let json_str = extract_json_object(&response).to_string();
    let suggestion: MetadataSuggestion =
        serde_json::from_str(&json_str).map_err(|e| format!("解析建议失败: {e}"))?;

    Ok(suggestion)
}
