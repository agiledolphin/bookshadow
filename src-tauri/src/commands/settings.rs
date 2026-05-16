use crate::config::{AppConfig, load, save};
use tauri::{Emitter, Manager};

#[tauri::command]
pub fn get_config() -> AppConfig {
    load()
}

#[tauri::command]
pub fn save_config(config: AppConfig) -> Result<(), String> {
    save(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_douban_login(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("douban-login") {
        let _ = win.close();
    }

    let login_url: url::Url = "https://accounts.douban.com/passport/login?source=book"
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    tauri::WebviewWindowBuilder::new(
        &app,
        "douban-login",
        tauri::WebviewUrl::External(login_url),
    )
    .title("豆瓣登录 — 登录成功后 Cookie 将自动保存")
    .inner_size(900.0, 700.0)
    .build()
    .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            let Some(win) = app_clone.get_webview_window("douban-login") else {
                let _ = app_clone.emit("douban-login-closed", ());
                break;
            };

            let url_str = win.url().map(|u| u.to_string()).unwrap_or_default();

            // Wait until we're past the login form
            if !url_str.contains("douban.com") || url_str.contains("accounts.douban.com") {
                continue;
            }

            #[cfg(target_os = "macos")]
            {
                let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
                // Wrap in Mutex<Option> so the Fn closure can send exactly once
                let tx = std::sync::Mutex::new(Some(tx));

                let _ = win.with_webview(move |wv| {
                    use core::ptr::NonNull;
                    use objc2_web_kit::WKWebView;
                    use objc2_foundation::{NSArray, NSHTTPCookie};
                    use block2::RcBlock;

                    unsafe {
                        let webview = &*(wv.inner() as *const WKWebView);
                        let config = webview.configuration();
                        let data_store = config.websiteDataStore();
                        let cookie_store = data_store.httpCookieStore();

                        let block = RcBlock::new(move |cookies: NonNull<NSArray<NSHTTPCookie>>| {
                            let arr = cookies.as_ref();
                            let mut parts: Vec<String> = Vec::new();
                            for i in 0..arr.count() {
                                let cookie = arr.objectAtIndex(i);
                                let domain = cookie.domain().to_string();
                                if domain.contains("douban.com") {
                                    let name = cookie.name().to_string();
                                    let value = cookie.value().to_string();
                                    parts.push(format!("{}={}", name, value));
                                }
                            }
                            let result = if parts.is_empty() { None } else { Some(parts.join("; ")) };
                            if let Some(sender) = tx.lock().unwrap().take() {
                                let _ = sender.send(result);
                            }
                        });

                        cookie_store.getAllCookies(&block);
                    }
                });

                let cookie_opt = match tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    rx,
                )
                .await
                {
                    Ok(Ok(v)) => v,
                    _ => None,
                };

                if let Some(cookie) = cookie_opt {
                    if cookie.contains("dbcl2=") && !cookie.contains("dbcl2=\"\"") {
                        let mut cfg = load();
                        cfg.douban_cookie = Some(cookie);
                        if save(&cfg).is_ok() {
                            let _ = app_clone.emit("douban-cookie-updated", ());
                            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                            if let Some(w) = app_clone.get_webview_window("douban-login") {
                                let _ = w.close();
                            }
                        }
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}
