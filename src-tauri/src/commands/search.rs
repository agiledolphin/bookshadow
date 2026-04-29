use crate::db::DbState;
use crate::commands::book::{Book, SELECT_COLS, row_to_book, resolve_order_by};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn search_books(
    state: State<'_, DbState>,
    query: String,
    limit: Option<i64>,
    offset: Option<i64>,
    sort_by: Option<String>,
) -> Result<Vec<Book>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let q = query.trim();
    let lim = limit.unwrap_or(i64::MAX);
    let off = offset.unwrap_or(0);
    let order_by = resolve_order_by(sort_by.as_deref());

    if q.is_empty() {
        let sql = format!(
            "SELECT {} FROM books ORDER BY {} LIMIT {} OFFSET {}",
            SELECT_COLS, order_by, lim, off
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        return stmt
            .query_map([], row_to_book)
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string());
    }

    let pattern = format!("%{}%", q);
    let sql = format!(
        "SELECT {} FROM books WHERE title LIKE ?1 OR author LIKE ?1 OR translator LIKE ?1 OR description LIKE ?1 OR tags LIKE ?1 ORDER BY {} LIMIT {} OFFSET {}",
        SELECT_COLS, order_by, lim, off
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let books = stmt
        .query_map(params![pattern], row_to_book)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(books)
}
