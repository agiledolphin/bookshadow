use crate::db::DbState;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct StatusCounts {
    pub total: i64,
    pub read: i64,
    pub reading: i64,
    pub want: i64,
    pub tobuy: i64,
}

#[derive(Debug, Serialize)]
pub struct YearCount {
    pub year: i32,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct LabelCount {
    pub label: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct ReadingStats {
    pub status_counts: StatusCounts,
    pub yearly: Vec<YearCount>,
    pub by_category: Vec<LabelCount>,
    pub by_region: Vec<LabelCount>,
    pub by_author: Vec<LabelCount>,
}

#[tauri::command]
pub fn get_stats(state: State<'_, DbState>) -> Result<ReadingStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let status_counts = {
        let mut stmt = conn.prepare(
            "SELECT COALESCE(status, ''), COUNT(*) FROM books GROUP BY COALESCE(status, '')"
        ).map_err(|e| e.to_string())?;
        let mut map: HashMap<String, i64> = HashMap::new();
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for r in rows {
            let (k, v) = r.map_err(|e| e.to_string())?;
            map.insert(k, v);
        }
        StatusCounts {
            total: map.values().sum(),
            read: map.get("read").copied().unwrap_or(0),
            reading: map.get("reading").copied().unwrap_or(0),
            want: map.get("want").copied().unwrap_or(0),
            tobuy: map.get("tobuy").copied().unwrap_or(0),
        }
    };

    let yearly = {
        let sql = "SELECT CAST(substr(finished_at,1,4) AS INTEGER), COUNT(*) \
                   FROM books WHERE finished_at IS NOT NULL AND length(finished_at) >= 4 \
                   GROUP BY 1 ORDER BY 1";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok(YearCount { year: row.get(0)?, count: row.get(1)? }))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let by_category = {
        let sql = "SELECT COALESCE(category, ''), COUNT(*) FROM books \
                   GROUP BY category ORDER BY COUNT(*) DESC";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok(LabelCount { label: row.get(0)?, count: row.get(1)? }))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let by_region = {
        let sql = "SELECT COALESCE(region, ''), COUNT(*) FROM books \
                   GROUP BY region ORDER BY COUNT(*) DESC";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok(LabelCount { label: row.get(0)?, count: row.get(1)? }))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    let by_author = {
        let sql = "SELECT author, COUNT(*) FROM books \
                   WHERE author IS NOT NULL AND author != '' AND status != 'tobuy' \
                   GROUP BY author ORDER BY COUNT(*) DESC LIMIT 20";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok(LabelCount { label: row.get(0)?, count: row.get(1)? }))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(ReadingStats {
        status_counts,
        yearly,
        by_category,
        by_region,
        by_author,
    })
}
