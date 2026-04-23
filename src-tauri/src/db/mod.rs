pub mod schema;

use once_cell::sync::OnceCell;
use rusqlite::Connection;
use std::sync::Mutex;
use anyhow::Result;
use std::path::PathBuf;

pub struct DbState(pub Mutex<Connection>);

static DATA_DIR: OnceCell<PathBuf> = OnceCell::new();

pub fn data_dir() -> PathBuf {
    DATA_DIR.get_or_init(|| {
        let home = dirs_next::home_dir().expect("cannot find home dir");
        home.join(".bookshadow")
    }).clone()
}

pub fn init_db() -> Result<Connection> {
    let dir = data_dir();
    let sqlite_dir = dir.join("sqlite");
    let covers_dir = dir.join("covers");
    std::fs::create_dir_all(&sqlite_dir)?;
    std::fs::create_dir_all(&covers_dir)?;

    let conn = Connection::open(sqlite_dir.join("bookshadow.db"))?;
    schema::migrate(&conn)?;
    Ok(conn)
}
