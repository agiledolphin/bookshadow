use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Review {
    pub id: i64,
    pub book_id: i64,
    pub content: String,
    pub reviewed_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateReview {
    pub book_id: i64,
    pub content: String,
    pub reviewed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReview {
    pub content: Option<String>,
    pub reviewed_at: Option<String>,
}

fn row_to_review(row: &rusqlite::Row<'_>) -> rusqlite::Result<Review> {
    Ok(Review {
        id: row.get(0)?,
        book_id: row.get(1)?,
        content: row.get(2)?,
        reviewed_at: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

#[tauri::command]
pub fn get_reviews(state: State<'_, DbState>, book_id: i64) -> Result<Vec<Review>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,book_id,content,reviewed_at,created_at,updated_at FROM reviews WHERE book_id=?1 ORDER BY reviewed_at DESC")
        .map_err(|e| e.to_string())?;
    let reviews = stmt
        .query_map(params![book_id], row_to_review)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(reviews)
}

#[tauri::command]
pub fn create_review(state: State<'_, DbState>, payload: CreateReview) -> Result<Review, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let reviewed_at = payload
        .reviewed_at
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    conn.execute(
        "INSERT INTO reviews (book_id, content, reviewed_at) VALUES (?1, ?2, ?3)",
        params![payload.book_id, payload.content, reviewed_at],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id,book_id,content,reviewed_at,created_at,updated_at FROM reviews WHERE id=?1",
        params![id],
        row_to_review,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_review(
    state: State<'_, DbState>,
    id: i64,
    payload: UpdateReview,
) -> Result<Review, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(content) = &payload.content {
        conn.execute(
            "UPDATE reviews SET content=?2, updated_at=datetime('now') WHERE id=?1",
            params![id, content],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(reviewed_at) = &payload.reviewed_at {
        conn.execute(
            "UPDATE reviews SET reviewed_at=?2, updated_at=datetime('now') WHERE id=?1",
            params![id, reviewed_at],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.query_row(
        "SELECT id,book_id,content,reviewed_at,created_at,updated_at FROM reviews WHERE id=?1",
        params![id],
        row_to_review,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_review(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM reviews WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn import_review_md(
    state: State<'_, DbState>,
    book_id: i64,
    path: String,
) -> Result<Review, String> {
    const MAX_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_SIZE {
        return Err("文件过大，最大支持 5 MB".to_string());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let reviewed_at = chrono::Local::now().format("%Y-%m-%d").to_string();
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO reviews (book_id, content, reviewed_at) VALUES (?1, ?2, ?3)",
        params![book_id, content, reviewed_at],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id,book_id,content,reviewed_at,created_at,updated_at FROM reviews WHERE id=?1",
        params![id],
        row_to_review,
    )
    .map_err(|e| e.to_string())
}
