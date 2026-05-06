use crate::db::{data_dir, DbState};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Only keep isbn if every character is a digit, hyphen, or 'X'/'x' (ISBN-10 check digit).
fn sanitize_isbn(isbn: Option<String>) -> Option<String> {
    isbn.and_then(|s| {
        let t = s.trim().to_string();
        if t.is_empty() || !t.chars().all(|c| c.is_ascii_digit() || c == '-' || c == 'X' || c == 'x') {
            None
        } else {
            Some(t)
        }
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: i64,
    pub title: String,
    pub author: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub pub_date: Option<String>,
    pub language: Option<String>,
    pub region: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub rating: Option<i32>,
    pub cover_url: Option<String>,
    pub cover_local: Option<String>,
    pub description: Option<String>,
    pub translator: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBook {
    pub title: String,
    pub author: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub pub_date: Option<String>,
    pub language: Option<String>,
    pub region: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub rating: Option<i32>,
    pub cover_url: Option<String>,
    pub description: Option<String>,
    pub translator: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBook {
    pub title: Option<String>,
    pub author: Option<String>,
    pub isbn: Option<String>,
    pub publisher: Option<String>,
    pub pub_date: Option<String>,
    pub language: Option<String>,
    pub region: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub rating: Option<i32>,
    pub cover_url: Option<String>,
    pub description: Option<String>,
    pub translator: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct BookFilters {
    pub rating: Option<i32>,
    pub language: Option<String>,
    pub region: Option<String>,
    pub category: Option<String>,
    pub decade: Option<i32>,
    pub status: Option<String>,
    pub tag: Option<String>,
    pub search_query: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub sort_by: Option<String>,
}

pub fn resolve_order_by(sort_by: Option<&str>) -> &'static str {
    match sort_by {
        Some("created_at_asc") => "created_at ASC",
        Some("title_asc")      => "title ASC",
        Some("pub_date_desc")  => "pub_date DESC",
        Some("pub_date_asc")   => "pub_date ASC",
        Some("rating_desc")    => "COALESCE(rating, 0) DESC",
        _                      => "created_at DESC",
    }
}

pub const SELECT_COLS: &str =
    "id,title,author,isbn,publisher,pub_date,language,region,category,tags,rating,cover_url,cover_local,description,translator,created_at,updated_at,status";

pub fn row_to_book(row: &rusqlite::Row<'_>) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        isbn: row.get(3)?,
        publisher: row.get(4)?,
        pub_date: row.get(5)?,
        language: row.get(6)?,
        region: row.get(7)?,
        category: row.get(8)?,
        tags: row.get(9)?,
        rating: row.get(10)?,
        cover_url: row.get(11)?,
        cover_local: row.get(12)?,
        description: row.get(13)?,
        translator: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        status: row.get(17)?,
    })
}

#[tauri::command]
pub fn get_books(
    state: State<'_, DbState>,
    filters: Option<BookFilters>,
) -> Result<Vec<Book>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let f = filters.unwrap_or_default();

    // 动态构建条件和参数，避免 placeholder 数量与参数数量不匹配
    let mut conditions: Vec<String> = vec![];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];

    if let Some(v) = f.rating   { conditions.push(format!("rating >= ?{}", param_values.len() + 1));   param_values.push(Box::new(v)); }
    if let Some(v) = f.language { conditions.push(format!("language = ?{}", param_values.len() + 1)); param_values.push(Box::new(v)); }
    if let Some(v) = f.region   { conditions.push(format!("region = ?{}", param_values.len() + 1));   param_values.push(Box::new(v)); }
    if let Some(v) = f.category { conditions.push(format!("category = ?{}", param_values.len() + 1)); param_values.push(Box::new(v)); }
    if let Some(v) = f.status   { conditions.push(format!("status = ?{}", param_values.len() + 1));   param_values.push(Box::new(v)); }
    if let Some(v) = f.tag     { conditions.push(format!("tags LIKE ?{}", param_values.len() + 1));   param_values.push(Box::new(format!("%\"{}\"%" , v))); }
    if let Some(ref v) = f.search_query {
        let q = v.trim();
        if !q.is_empty() {
            let n = param_values.len() + 1;
            conditions.push(format!(
                "(title LIKE ?{n} OR author LIKE ?{n} OR translator LIKE ?{n} OR description LIKE ?{n} OR tags LIKE ?{n})"
            ));
            param_values.push(Box::new(format!("%{}%", q)));
        }
    }
    if let Some(v) = f.decade {
        let from = format!("{}", v);
        let to   = format!("{}", v + 9);
        conditions.push(format!("substr(pub_date,1,4) >= ?{} AND substr(pub_date,1,4) <= ?{}", param_values.len() + 1, param_values.len() + 2));
        param_values.push(Box::new(from));
        param_values.push(Box::new(to));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let order_by = resolve_order_by(f.sort_by.as_deref());
    let sql = match f.limit {
        Some(lim) => format!(
            "SELECT {} FROM books {} ORDER BY {} LIMIT {} OFFSET {}",
            SELECT_COLS, where_clause, order_by, lim, f.offset.unwrap_or(0)
        ),
        None => format!(
            "SELECT {} FROM books {} ORDER BY {}",
            SELECT_COLS, where_clause, order_by
        ),
    };

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let books = stmt
        .query_map(param_refs.as_slice(), row_to_book)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(books)
}

#[tauri::command]
pub fn get_book(state: State<'_, DbState>, id: i64) -> Result<Book, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {} FROM books WHERE id=?1", SELECT_COLS),
        params![id],
        row_to_book,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_book(state: State<'_, DbState>, mut payload: CreateBook) -> Result<Book, String> {
    payload.isbn = sanitize_isbn(payload.isbn);
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(ref isbn) = payload.isbn {
        if !isbn.trim().is_empty() {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM books WHERE isbn = ?1)",
                    params![isbn.trim()],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if exists {
                return Err(format!("ISBN {} 已存在", isbn.trim()));
            }
        }
    }

    conn.execute(
        "INSERT INTO books (title,author,isbn,publisher,pub_date,language,region,category,tags,rating,cover_url,description,translator,status) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![
            payload.title, payload.author, payload.isbn, payload.publisher,
            payload.pub_date, payload.language, payload.region, payload.category,
            payload.tags.unwrap_or_else(|| "[]".into()),
            payload.rating, payload.cover_url, payload.description, payload.translator,
            payload.status
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("SELECT {} FROM books WHERE id=?1", SELECT_COLS),
        params![id],
        row_to_book,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_book(
    state: State<'_, DbState>,
    id: i64,
    mut payload: UpdateBook,
) -> Result<Book, String> {
    payload.isbn = sanitize_isbn(payload.isbn);
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut sets: Vec<String> = vec![];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = vec![];
    param_values.push(Box::new(id)); // ?1 → WHERE id=?1

    macro_rules! push_field {
        ($val:expr, $col:expr) => {
            if let Some(v) = $val {
                sets.push(format!("{}=?{}", $col, param_values.len() + 1));
                param_values.push(Box::new(v));
            }
        };
    }

    push_field!(payload.title,       "title");
    push_field!(payload.author,      "author");
    push_field!(payload.isbn,        "isbn");
    push_field!(payload.publisher,   "publisher");
    push_field!(payload.pub_date,    "pub_date");
    push_field!(payload.language,    "language");
    push_field!(payload.region,      "region");
    push_field!(payload.category,    "category");
    push_field!(payload.tags,        "tags");
    push_field!(payload.rating,      "rating");
    push_field!(payload.cover_url,   "cover_url");
    push_field!(payload.description, "description");
    push_field!(payload.translator,  "translator");
    if let Some(v) = payload.status {
        sets.push(format!("status=nullif(?{},'')", param_values.len() + 1));
        param_values.push(Box::new(v));
    }
    sets.push("updated_at=datetime('now')".into());

    let sql = format!("UPDATE books SET {} WHERE id=?1", sets.join(", "));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {} FROM books WHERE id=?1", SELECT_COLS),
        params![id],
        row_to_book,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_book(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    // 删除前先取出本地封面路径
    let cover_local: Option<String> = conn
        .query_row(
            "SELECT cover_local FROM books WHERE id=?1",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(None);

    conn.execute("DELETE FROM books WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;

    if let Some(path) = cover_local {
        if !path.is_empty() {
            let _ = std::fs::remove_file(&path);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn download_cover(
    state: State<'_, DbState>,
    id: i64,
    url: String,
    isbn: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .header("Referer", "https://book.douban.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("封面下载失败: HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

    let ext = if url.ends_with(".png") { "png" } else { "jpg" };
    let stem = match sanitize_isbn(isbn) {
        Some(s) => format!("{}_{}", id, s),
        None    => id.to_string(),
    };
    let covers_dir = data_dir().join("covers");
    let path = covers_dir.join(format!("{}.{}", stem, ext));

    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    let path_str = path.to_string_lossy().to_string();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE books SET cover_local=?1, updated_at=datetime('now') WHERE id=?2",
        params![path_str, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(path_str)
}

#[tauri::command]
pub fn upload_cover(state: State<'_, DbState>, id: i64, src_path: String) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let isbn: Option<String> = conn
        .query_row("SELECT isbn FROM books WHERE id=?1", params![id], |row| row.get(0))
        .unwrap_or(None);

    let src = std::path::Path::new(&src_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    let stem = match sanitize_isbn(isbn) {
        Some(s) => format!("{}_{}", id, s),
        None    => id.to_string(),
    };
    let dest = data_dir().join("covers").join(format!("{}.{}", stem, ext));

    std::fs::copy(src, &dest).map_err(|e| format!("复制图片失败: {}", e))?;

    let dest_str = dest.to_string_lossy().to_string();
    conn.execute(
        "UPDATE books SET cover_local=?1, cover_url=NULL, updated_at=datetime('now') WHERE id=?2",
        params![dest_str, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(dest_str)
}
