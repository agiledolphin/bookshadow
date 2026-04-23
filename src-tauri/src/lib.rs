mod db;
mod commands;
mod isbn;
mod config;

use db::DbState;
use std::sync::Mutex;

#[tauri::command]
async fn fetch_by_isbn(isbn: String, source: Option<String>) -> Result<isbn::BookMeta, String> {
    let cfg = config::load();
    isbn::fetch_by_isbn(&isbn, source.as_deref(), cfg.google_books_api_key.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = db::init_db().expect("failed to initialize database");

    tauri::Builder::default()
        .register_uri_scheme_protocol("bookcover", |_ctx, request| {
            let forbidden = tauri::http::Response::builder()
                .status(403)
                .body(b"forbidden".to_vec())
                .unwrap();

            let uri = request.uri().to_string();
            let raw = uri.split('/').last().unwrap_or("").split('?').next().unwrap_or("");

            // 白名单：只允许字母、数字、连字符、下划线、点（且点不能在开头）
            let valid = !raw.is_empty()
                && !raw.starts_with('.')
                && raw.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.');
            if !valid {
                return forbidden;
            }

            let covers_dir = db::data_dir().join("covers");
            let file_path = covers_dir.join(raw);

            // 确认最终路径仍在 covers 目录内（防止符号链接绕过）
            let Ok(canonical) = file_path.canonicalize() else {
                return tauri::http::Response::builder()
                    .status(404).body(b"not found".to_vec()).unwrap();
            };
            if !canonical.starts_with(&covers_dir) {
                return forbidden;
            }

            match std::fs::read(&canonical) {
                Ok(bytes) => {
                    let ct = if raw.ends_with(".png") { "image/png" } else { "image/jpeg" };
                    tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", ct)
                        .body(bytes)
                        .unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(404).body(b"not found".to_vec()).unwrap(),
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(DbState(Mutex::new(conn)))
        .invoke_handler(tauri::generate_handler![
            fetch_by_isbn,
            commands::book::get_books,
            commands::book::get_book,
            commands::book::create_book,
            commands::book::update_book,
            commands::book::delete_book,
            commands::book::download_cover,
            commands::review::get_reviews,
            commands::review::create_review,
            commands::review::update_review,
            commands::review::delete_review,
            commands::review::import_review_md,
            commands::search::search_books,
            commands::settings::get_config,
            commands::settings::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
