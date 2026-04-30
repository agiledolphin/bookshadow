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
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
            content     TEXT NOT NULL DEFAULT '',
            reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
            title, author, description, tags,
            content='books', content_rowid='id',
            tokenize='trigram'
        );

        CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
            INSERT INTO books_fts(rowid, title, author, description, tags)
            VALUES (new.id, new.title, COALESCE(new.author,''), COALESCE(new.description,''), COALESCE(new.tags,''));
        END;

        CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
            INSERT INTO books_fts(books_fts, rowid, title, author, description, tags)
            VALUES ('delete', old.id, old.title, COALESCE(old.author,''), COALESCE(old.description,''), COALESCE(old.tags,''));
            INSERT INTO books_fts(rowid, title, author, description, tags)
            VALUES (new.id, new.title, COALESCE(new.author,''), COALESCE(new.description,''), COALESCE(new.tags,''));
        END;

        CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
            INSERT INTO books_fts(books_fts, rowid, title, author, description, tags)
            VALUES ('delete', old.id, old.title, COALESCE(old.author,''), COALESCE(old.description,''), COALESCE(old.tags,''));
        END;

        PRAGMA user_version = 2;
        "#,
    )?;

    Ok(())
}
