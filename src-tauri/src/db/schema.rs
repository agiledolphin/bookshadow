use rusqlite::Connection;
use anyhow::Result;

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS books (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            author      TEXT,
            isbn        TEXT UNIQUE,
            publisher   TEXT,
            pub_date    TEXT,
            language    TEXT,
            region      TEXT,
            category    TEXT,
            tags        TEXT DEFAULT '[]',
            rating      INTEGER CHECK(rating IS NULL OR (rating >= 1 AND rating <= 5)),
            cover_url   TEXT,
            cover_local TEXT,
            description TEXT,
            translator  TEXT,
            status      TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
            started_at  TEXT,
            finished_at TEXT,
            series      TEXT
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            content     TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "#,
    )?;

    conn.execute_batch(
        "UPDATE books SET status = 'want' WHERE status IS NULL OR status = '';"
    )?;

    // Migrations: ignore errors when column already exists
    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN douban_rating REAL;");
    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN goodreads_rating REAL;");

    Ok(())
}
