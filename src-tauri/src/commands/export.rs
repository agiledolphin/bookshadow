use crate::db::DbState;
use crate::commands::book::{Book, SELECT_COLS, row_to_book};
use tauri::State;

fn csv_field(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

#[tauri::command]
pub fn export_books(state: State<'_, DbState>, path: String, format: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM books ORDER BY created_at DESC", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let books = stmt
        .query_map([], row_to_book)
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<Book>>>()
        .map_err(|e| e.to_string())?;

    match format.as_str() {
        "json" => {
            let json = serde_json::to_string_pretty(&books).map_err(|e| e.to_string())?;
            std::fs::write(&path, json).map_err(|e| e.to_string())?;
        }
        "csv" => {
            let mut lines = Vec::with_capacity(books.len() + 1);
            lines.push("id,title,author,translator,isbn,publisher,pub_date,language,region,category,rating,status,description,created_at".to_string());
            for b in &books {
                lines.push(format!(
                    "{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
                    b.id,
                    csv_field(&b.title),
                    csv_field(b.author.as_deref().unwrap_or("")),
                    csv_field(b.translator.as_deref().unwrap_or("")),
                    csv_field(b.isbn.as_deref().unwrap_or("")),
                    csv_field(b.publisher.as_deref().unwrap_or("")),
                    csv_field(b.pub_date.as_deref().unwrap_or("")),
                    csv_field(b.language.as_deref().unwrap_or("")),
                    csv_field(b.region.as_deref().unwrap_or("")),
                    csv_field(b.category.as_deref().unwrap_or("")),
                    b.rating.map(|r| r.to_string()).unwrap_or_default(),
                    csv_field(b.status.as_deref().unwrap_or("")),
                    csv_field(b.description.as_deref().unwrap_or("")),
                    csv_field(&b.created_at),
                ));
            }
            std::fs::write(&path, lines.join("\n")).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("unsupported format: {}", format)),
    }
    Ok(())
}
