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
        "#,
    )?;

    // v0→v1: 列迁移
    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN translator TEXT;");
    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN pub_date TEXT;");
    let _ = conn.execute_batch(
        "UPDATE books SET pub_date = CAST(pub_year AS TEXT) WHERE pub_year IS NOT NULL AND pub_date IS NULL;"
    );

    // v1→v2: 重建 FTS 为 trigram tokenizer（支持中文子串搜索）
    // 用 user_version 标记，避免每次启动都重建
    let user_version: i32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);

    let _ = conn.execute_batch("ALTER TABLE books ADD COLUMN status TEXT;");

    if user_version < 2 {
        conn.execute_batch(
            r#"
            DROP TRIGGER IF EXISTS books_ai;
            DROP TRIGGER IF EXISTS books_au;
            DROP TRIGGER IF EXISTS books_ad;
            DROP TABLE IF EXISTS books_fts;

            CREATE VIRTUAL TABLE books_fts USING fts5(
                title, author, description, tags,
                content='books', content_rowid='id',
                tokenize='trigram'
            );

            CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN
                INSERT INTO books_fts(rowid, title, author, description, tags)
                VALUES (new.id, new.title, COALESCE(new.author,''), COALESCE(new.description,''), COALESCE(new.tags,''));
            END;
            CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN
                INSERT INTO books_fts(books_fts, rowid, title, author, description, tags)
                VALUES ('delete', old.id, old.title, COALESCE(old.author,''), COALESCE(old.description,''), COALESCE(old.tags,''));
                INSERT INTO books_fts(rowid, title, author, description, tags)
                VALUES (new.id, new.title, COALESCE(new.author,''), COALESCE(new.description,''), COALESCE(new.tags,''));
            END;
            CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN
                INSERT INTO books_fts(books_fts, rowid, title, author, description, tags)
                VALUES ('delete', old.id, old.title, COALESCE(old.author,''), COALESCE(old.description,''), COALESCE(old.tags,''));
            END;

            INSERT INTO books_fts(rowid, title, author, description, tags)
                SELECT id, title, COALESCE(author,''), COALESCE(description,''), COALESCE(tags,'')
                FROM books;

            PRAGMA user_version = 2;
            "#,
        )?;
    }

    Ok(())
}
