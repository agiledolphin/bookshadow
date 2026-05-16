use crate::db::DbState;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct StatusCounts {
    pub total: i64,
    pub read: i64,
    pub reading: i64,
    pub want: i64,
    pub unset: i64,
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
}

#[tauri::command]
pub fn get_stats(state: State<'_, DbState>) -> Result<ReadingStats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let total = conn
        .query_row("SELECT COUNT(*) FROM books", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let read = conn
        .query_row("SELECT COUNT(*) FROM books WHERE status = 'read'", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let reading = conn
        .query_row("SELECT COUNT(*) FROM books WHERE status = 'reading'", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let want = conn
        .query_row("SELECT COUNT(*) FROM books WHERE status = 'want'", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let unset = conn
        .query_row("SELECT COUNT(*) FROM books WHERE status IS NULL", [], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;

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

    Ok(ReadingStats {
        status_counts: StatusCounts { total, read, reading, want, unset },
        yearly,
        by_category,
        by_region,
    })
}
