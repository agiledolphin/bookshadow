use crate::commands::book::BookFilters;
use crate::db::DbState;
use rusqlite::types::ToSql;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct FilterCounts {
    pub total: i64,
    pub status: HashMap<String, i64>,
    pub region: HashMap<String, i64>,
    pub category: HashMap<String, i64>,
    pub language: HashMap<String, i64>,
    /// Cumulative: rating[r] = count of books with rating >= r
    pub rating: HashMap<i32, i64>,
    pub decade: HashMap<i32, i64>,
    pub tag: HashMap<String, i64>,
    pub has_review: i64,
}

/// Build WHERE clause + owned params, excluding one sidebar dimension.
/// search_query is always applied (never excluded).
fn build_where(f: &BookFilters, exclude: &str) -> (String, Vec<Box<dyn ToSql>>) {
    let mut conds: Vec<String> = vec![];
    let mut params: Vec<Box<dyn ToSql>> = vec![];

    if let Some(ref v) = f.search_query {
        let q = v.trim();
        if !q.is_empty() {
            let n = params.len() + 1;
            conds.push(format!(
                "(title LIKE ?{n} OR author LIKE ?{n} OR translator LIKE ?{n} OR publisher LIKE ?{n} OR description LIKE ?{n} OR tags LIKE ?{n} OR series LIKE ?{n})"
            ));
            params.push(Box::new(format!("%{}%", q)));
        }
    }

    if exclude != "status" {
        if let Some(ref v) = f.status {
            if v.is_empty() {
                conds.push("status IS NULL".to_string());
            } else {
                conds.push(format!("status = ?{}", params.len() + 1));
                params.push(Box::new(v.clone()));
            }
        }
    }
    if exclude != "region" {
        if let Some(ref v) = f.region {
            if v.is_empty() {
                conds.push("(region IS NULL OR region = '')".to_string());
            } else {
                conds.push(format!("region = ?{}", params.len() + 1));
                params.push(Box::new(v.clone()));
            }
        }
    }
    if exclude != "category" {
        if let Some(ref v) = f.category {
            if v.is_empty() {
                conds.push("(category IS NULL OR category = '')".to_string());
            } else {
                conds.push(format!("category = ?{}", params.len() + 1));
                params.push(Box::new(v.clone()));
            }
        }
    }
    if exclude != "language" {
        if let Some(ref v) = f.language {
            conds.push(format!("language = ?{}", params.len() + 1));
            params.push(Box::new(v.clone()));
        }
    }
    if exclude != "rating" {
        if let Some(v) = f.rating {
            conds.push(format!("rating >= ?{}", params.len() + 1));
            params.push(Box::new(v));
        }
    }
    if exclude != "tag" {
        if let Some(ref v) = f.tag {
            let escaped = v.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
            conds.push(format!("tags LIKE ?{} ESCAPE '\\'", params.len() + 1));
            params.push(Box::new(format!("%\"{}\"%" , escaped)));
        }
    }
    if exclude != "has_review" {
        if let Some(true) = f.has_review {
            conds.push("EXISTS (SELECT 1 FROM reviews WHERE reviews.book_id = books.id)".to_string());
        }
    }
    if exclude != "decade" {
        if let Some(v) = f.decade {
            conds.push(format!(
                "substr(pub_date,1,4) >= ?{} AND substr(pub_date,1,4) <= ?{}",
                params.len() + 1,
                params.len() + 2
            ));
            params.push(Box::new(format!("{}", v)));
            params.push(Box::new(format!("{}", v + 9)));
        }
    }

    let where_clause = if conds.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conds.join(" AND "))
    };

    (where_clause, params)
}

fn str_group(
    conn: &rusqlite::Connection,
    col: &str,
    f: &BookFilters,
    exclude: &str,
) -> Result<HashMap<String, i64>, String> {
    let (w, owned) = build_where(f, exclude);
    let full_where = if w.is_empty() { String::new() } else { w };
    let sql = format!(
        "SELECT COALESCE(NULLIF({col},''),''), COUNT(*) FROM books {full_where} GROUP BY COALESCE(NULLIF({col},''),'')"
    );
    let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    let rows = stmt
        .query_map(refs.as_slice(), |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map)
}

fn rating_group(
    conn: &rusqlite::Connection,
    f: &BookFilters,
) -> Result<HashMap<i32, i64>, String> {
    let (w, owned) = build_where(f, "rating");
    let full_where = if w.is_empty() {
        "WHERE rating IS NOT NULL".to_string()
    } else {
        format!("{} AND rating IS NOT NULL", w)
    };
    let sql = format!("SELECT rating, COUNT(*) FROM books {full_where} GROUP BY rating");
    let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut raw: HashMap<i32, i64> = HashMap::new();
    let rows = stmt
        .query_map(refs.as_slice(), |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        raw.insert(k, v);
    }
    // Cumulative: rating[r] = count of books with rating >= r
    let mut cumulative = HashMap::new();
    for r in 1..=5i32 {
        let count: i64 = (r..=5).filter_map(|s| raw.get(&s)).sum();
        if count > 0 {
            cumulative.insert(r, count);
        }
    }
    Ok(cumulative)
}

fn decade_group(
    conn: &rusqlite::Connection,
    f: &BookFilters,
) -> Result<HashMap<i32, i64>, String> {
    let (w, owned) = build_where(f, "decade");
    let decade_expr = "CAST(CAST(substr(pub_date,1,4) AS INTEGER) / 10 * 10 AS INTEGER)";
    let full_where = if w.is_empty() {
        format!("WHERE length(pub_date) >= 4 AND CAST(substr(pub_date,1,4) AS INTEGER) > 0")
    } else {
        format!(
            "{} AND length(pub_date) >= 4 AND CAST(substr(pub_date,1,4) AS INTEGER) > 0",
            w
        )
    };
    let sql = format!(
        "SELECT {decade_expr}, COUNT(*) FROM books {full_where} GROUP BY 1"
    );
    let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    let rows = stmt
        .query_map(refs.as_slice(), |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(map)
}

fn tag_group(
    conn: &rusqlite::Connection,
    f: &BookFilters,
) -> Result<HashMap<String, i64>, String> {
    let (w, owned) = build_where(f, "tag");
    let full_where = if w.is_empty() {
        "WHERE tags IS NOT NULL AND tags != '[]'".to_string()
    } else {
        format!("{} AND tags IS NOT NULL AND tags != '[]'", w)
    };
    let sql = format!("SELECT tags FROM books {full_where}");
    let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(refs.as_slice(), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut map: HashMap<String, i64> = HashMap::new();
    for r in rows {
        let tags_json = r.map_err(|e| e.to_string())?;
        if let Ok(tags) = serde_json::from_str::<Vec<String>>(&tags_json) {
            for tag in tags {
                *map.entry(tag).or_insert(0) += 1;
            }
        }
    }
    Ok(map)
}

#[tauri::command]
pub fn get_filter_counts(
    state: State<'_, DbState>,
    filters: Option<BookFilters>,
) -> Result<FilterCounts, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let f = filters.unwrap_or_default();

    // total = search-only count (no sidebar filters)
    let total: i64 = {
        let search_only = BookFilters {
            search_query: f.search_query.clone(),
            ..Default::default()
        };
        let (w, owned) = build_where(&search_only, "__none__");
        let sql = format!("SELECT COUNT(*) FROM books {}", w);
        let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
        conn.query_row(&sql, refs.as_slice(), |r| r.get(0))
            .map_err(|e| e.to_string())?
    };

    let mut status = str_group(&conn, "status", &f, "status")?;
    {
        let (w, owned) = build_where(&f, "status");
        let null_where = if w.is_empty() {
            "WHERE status IS NULL".to_string()
        } else {
            format!("{} AND status IS NULL", w)
        };
        let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
        let n: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM books {null_where}"), refs.as_slice(), |r| r.get(0))
            .unwrap_or(0);
        if n > 0 {
            status.insert("".to_string(), n);
        }
    }
    let region   = str_group(&conn, "region",   &f, "region")?;
    let category = str_group(&conn, "category", &f, "category")?;
    let language = str_group(&conn, "language", &f, "language")?;
    let rating   = rating_group(&conn, &f)?;
    let decade   = decade_group(&conn, &f)?;
    let tag      = tag_group(&conn, &f)?;

    let has_review: i64 = {
        let (w, owned) = build_where(&f, "has_review");
        let exists = "EXISTS (SELECT 1 FROM reviews WHERE reviews.book_id = books.id)";
        let sql = if w.is_empty() {
            format!("SELECT COUNT(*) FROM books WHERE {exists}")
        } else {
            format!("SELECT COUNT(*) FROM books {} AND {exists}", w)
        };
        let refs: Vec<&dyn ToSql> = owned.iter().map(|p| p.as_ref()).collect();
        conn.query_row(&sql, refs.as_slice(), |r| r.get(0)).unwrap_or(0)
    };

    Ok(FilterCounts { total, status, region, category, language, rating, decade, tag, has_review })
}
