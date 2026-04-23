use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AppConfig {
    pub google_books_api_key: Option<String>,
}

fn config_path() -> PathBuf {
    crate::db::data_dir().join("config.json")
}

pub fn load() -> AppConfig {
    let path = config_path();
    let Ok(text) = std::fs::read_to_string(&path) else { return AppConfig::default(); };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save(cfg: &AppConfig) -> Result<()> {
    let path = config_path();
    let text = serde_json::to_string_pretty(cfg)?;
    std::fs::write(&path, text)?;
    Ok(())
}
