use crate::config::load;
use crate::db::DbState;
use crate::isbn;
use rusqlite::params;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, State};

/// 批量回填社区评分的运行状态：防止重复启动 + 支持中途取消
#[derive(Default)]
pub struct RatingsRefreshState {
    running: AtomicBool,
    cancel: AtomicBool,
}

/// 每本书之间的间隔（豆瓣与 Goodreads 并行请求，各自主机上约 1 次/1.5s）
const REQUEST_INTERVAL: Duration = Duration::from_millis(1500);

#[derive(Serialize, Clone)]
pub struct RefreshProgress {
    pub done: usize,
    pub total: usize,
    pub title: String,
    pub updated: usize,
}

#[derive(Serialize)]
pub struct RefreshSummary {
    pub total: usize,
    pub updated: usize,
    pub failed: usize,
    pub cancelled: bool,
    /// 豆瓣中途停用的原因（如 Cookie 失效），其余书只查 Goodreads
    pub douban_error: Option<String>,
}

struct Target {
    id: i64,
    title: String,
    isbn: String,
    need_douban: bool,
    need_goodreads: bool,
}

/// 清除运行标记（含 panic / 提前返回路径）
struct RunningGuard<'a>(&'a AtomicBool);
impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn refresh_community_ratings(
    db: State<'_, DbState>,
    refresh: State<'_, RatingsRefreshState>,
    app: tauri::AppHandle,
    only_missing: bool,
) -> Result<RefreshSummary, String> {
    if refresh.running.swap(true, Ordering::SeqCst) {
        return Err("评分回填正在进行中".into());
    }
    let _guard = RunningGuard(&refresh.running);
    refresh.cancel.store(false, Ordering::SeqCst);

    let targets: Vec<Target> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, isbn, douban_rating IS NULL, goodreads_rating IS NULL FROM books \
                 WHERE isbn IS NOT NULL AND isbn != '' \
                   AND (?1 = 0 OR douban_rating IS NULL OR goodreads_rating IS NULL) \
                 ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![only_missing], |r| {
                let missing_db: bool = r.get(3)?;
                let missing_gr: bool = r.get(4)?;
                Ok(Target {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    isbn: r.get::<_, String>(2)?.replace('-', ""),
                    need_douban: !only_missing || missing_db,
                    need_goodreads: !only_missing || missing_gr,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    let cookie = load().douban_cookie;
    let total = targets.len();
    let mut updated = 0;
    let mut failed = 0;
    let mut cancelled = false;
    let mut douban_error: Option<String> = None;

    for (i, t) in targets.iter().enumerate() {
        if refresh.cancel.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        if i > 0 {
            tokio::time::sleep(REQUEST_INTERVAL).await;
        }

        let use_douban = t.need_douban && douban_error.is_none();
        let (db_res, gr_res) = tokio::join!(
            async {
                if use_douban { Some(isbn::douban::fetch(&t.isbn, cookie.as_deref()).await) } else { None }
            },
            async {
                if t.need_goodreads { Some(isbn::goodreads::fetch_book(&t.isbn).await) } else { None }
            },
        );

        let mut any_err = false;
        let douban_rating = match db_res {
            Some(Ok(m)) => m.douban_rating,
            Some(Err(e)) => {
                let msg = e.to_string();
                if msg.contains("Cookie 已失效") {
                    douban_error = Some(msg);
                } else {
                    eprintln!("[ratings] douban {} ({}) err: {}", t.isbn, t.title, msg);
                    any_err = true;
                }
                None
            }
            None => None,
        };
        let goodreads_rating = match gr_res {
            Some(Ok(m)) => m.goodreads_rating,
            Some(Err(e)) => {
                eprintln!("[ratings] goodreads {} ({}) err: {}", t.isbn, t.title, e);
                any_err = true;
                None
            }
            None => None,
        };

        if douban_rating.is_some() || goodreads_rating.is_some() {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE books SET douban_rating = COALESCE(?1, douban_rating), \
                 goodreads_rating = COALESCE(?2, goodreads_rating) WHERE id = ?3",
                params![douban_rating, goodreads_rating, t.id],
            )
            .map_err(|e| e.to_string())?;
            updated += 1;
        } else if any_err {
            failed += 1;
        }

        app.emit(
            "ratings_refresh_progress",
            RefreshProgress { done: i + 1, total, title: t.title.clone(), updated },
        )
        .ok();
    }

    Ok(RefreshSummary { total, updated, failed, cancelled, douban_error })
}

#[tauri::command]
pub fn cancel_refresh_ratings(refresh: State<'_, RatingsRefreshState>) {
    refresh.cancel.store(true, Ordering::SeqCst);
}
