use crate::config::{AppConfig, load, save};

#[tauri::command]
pub fn get_config() -> AppConfig {
    load()
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    save(&config).map_err(|e| e.to_string())
}
