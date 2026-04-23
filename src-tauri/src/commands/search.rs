use crate::db::DbState;
use crate::commands::book::{Book, SELECT_COLS, row_to_book};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn search_books(state: State<'_, DbState>, query: String) -> Result<Vec<Book>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let q = query.trim();

    if q.is_empty() {
        let sql = format!("SELECT {} FROM books ORDER BY created_at DESC", SELECT_COLS);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        return stmt
            .query_map([], row_to_book)
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string());
    }

    let pattern = format!("%{}%", q);
    let sql = format!(
        "SELECT {} FROM books WHERE title LIKE ?1 OR author LIKE ?1 OR translator LIKE ?1 OR description LIKE ?1 OR tags LIKE ?1 ORDER BY created_at DESC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let books = stmt
        .query_map(params![pattern], row_to_book)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(books)
}
