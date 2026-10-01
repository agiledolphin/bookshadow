use rusqlite::Connection;
use anyhow::{Context, Result};

/// 版本化迁移：`schema_migrations` 表记录已执行的步骤（版本号 = 下标 + 1）。
/// 每一步在独立事务中执行，与版本记录一同提交。
///
/// 不使用 `PRAGMA user_version`：早期版本曾写入过该值（2 / 4），会与新编号冲突。
///
/// 规则：只能在末尾追加新步骤，不得修改或删除已发布的步骤。
/// 早期数据库（无 schema_migrations 表）可能已执行过部分 DDL，
/// 因此前几步必须幂等（IF NOT EXISTS / add_column_if_missing）。
type Migration = fn(&Connection) -> Result<()>;

const MIGRATIONS: &[Migration] = &[
    m001_initial_tables,
    m002_status_default_want,
    m003_community_ratings,
    m004_reviews_book_id_index,
    m005_clear_douban_placeholder_covers,
];

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    let current: usize = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |r| r.get::<_, i64>(0),
    )? as usize;
    if current > MIGRATIONS.len() {
        eprintln!(
            "[db] schema version {} is newer than this app ({}); skipping migrations",
            current,
            MIGRATIONS.len()
        );
        return Ok(());
    }

    for (i, step) in MIGRATIONS.iter().enumerate().skip(current) {
        let version = i + 1;
        let tx = conn.unchecked_transaction()?;
        step(&tx).with_context(|| format!("migration {} failed", version))?;
        tx.execute("INSERT INTO schema_migrations (version) VALUES (?1)", [version as i64])?;
        tx.commit()?;
        eprintln!("[db] migrated to schema version {}", version);
    }

    Ok(())
}

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, decl: &str) -> Result<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2)",
        [table, column],
        |r| r.get(0),
    )?;
    if !exists {
        conn.execute_batch(&format!("ALTER TABLE {} ADD COLUMN {} {};", table, column, decl))?;
    }
    Ok(())
}

fn m001_initial_tables(conn: &Connection) -> Result<()> {
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
    Ok(())
}

/// 「未设」并入「想读」
fn m002_status_default_want(conn: &Connection) -> Result<()> {
    conn.execute_batch("UPDATE books SET status = 'want' WHERE status IS NULL OR status = '';")?;
    Ok(())
}

/// 豆瓣 / Goodreads 社区评分
fn m003_community_ratings(conn: &Connection) -> Result<()> {
    add_column_if_missing(conn, "books", "douban_rating", "REAL")?;
    add_column_if_missing(conn, "books", "goodreads_rating", "REAL")?;
    Ok(())
}

/// SELECT_COLS 中 review_count 子查询和 has_review 筛选按 book_id 查 reviews
fn m004_reviews_book_id_index(conn: &Connection) -> Result<()> {
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id);")?;
    Ok(())
}

/// 清除早期导入时误存的豆瓣默认占位封面（book-default-*.gif），恢复为「无封面」
fn m005_clear_douban_placeholder_covers(conn: &Connection) -> Result<()> {
    let files: Vec<String> = conn
        .prepare(
            "SELECT cover_local FROM books \
             WHERE cover_url LIKE '%/book-default%' AND cover_local IS NOT NULL AND cover_local != ''",
        )?
        .query_map([], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    conn.execute_batch(
        "UPDATE books SET cover_url = NULL, cover_local = NULL WHERE cover_url LIKE '%/book-default%';",
    )?;
    for f in files {
        let _ = std::fs::remove_file(f);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(conn: &Connection) -> usize {
        conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r.get::<_, i64>(0)).unwrap() as usize
    }

    #[test]
    fn fresh_db_reaches_latest_and_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        assert_eq!(version(&conn), MIGRATIONS.len());
        migrate(&conn).unwrap();
        assert_eq!(version(&conn), MIGRATIONS.len());
    }

    #[test]
    fn legacy_db_with_rating_columns_migrates() {
        // 模拟旧版本：无 schema_migrations 表、残留 user_version = 4，
        // 已 ALTER 过评分列，且存在空状态
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA user_version = 4;").unwrap();
        m001_initial_tables(&conn).unwrap();
        conn.execute_batch(
            "ALTER TABLE books ADD COLUMN douban_rating REAL;
             ALTER TABLE books ADD COLUMN goodreads_rating REAL;
             INSERT INTO books (title, status, douban_rating) VALUES ('a', NULL, 8.1);",
        )
        .unwrap();

        migrate(&conn).unwrap();
        assert_eq!(version(&conn), MIGRATIONS.len());
        let (status, rating): (String, f64) = conn
            .query_row("SELECT status, douban_rating FROM books", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!(status, "want");
        assert_eq!(rating, 8.1);
    }

    #[test]
    fn placeholder_covers_are_cleared() {
        let conn = Connection::open_in_memory().unwrap();
        for step in &MIGRATIONS[..4] { step(&conn).unwrap(); }
        conn.execute_batch(
            "INSERT INTO books (title, cover_url, cover_local) VALUES
               ('a', 'https://img1.doubanio.com/cuphead/book-static/pics/book-default-lpic.gif', '/nonexistent/a.jpg'),
               ('b', 'https://img3.doubanio.com/view/subject/s/public/s1.jpg', '/nonexistent/b.jpg');",
        )
        .unwrap();
        m005_clear_douban_placeholder_covers(&conn).unwrap();
        let rows: Vec<(Option<String>, Option<String>)> = conn
            .prepare("SELECT cover_url, cover_local FROM books ORDER BY title").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
            .collect::<rusqlite::Result<_>>().unwrap();
        assert_eq!(rows[0], (None, None));
        assert!(rows[1].0.is_some() && rows[1].1.is_some());
    }
}
