use base64::Engine as _;
use serde::Serialize;

#[derive(Serialize)]
pub struct ScanResult {
    pub isbn: Option<String>,
    pub thumbnail: String,
}

#[tauri::command]
pub async fn scan_isbn_image(path: String) -> Result<ScanResult, String> {
    tokio::task::spawn_blocking(move || scan_blocking(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn scan_blocking(path: &str) -> Result<ScanResult, String> {
    let img = image::open(path).map_err(|e| format!("无法打开图片: {}", e))?;

    // Thumbnail: max 200px wide, maintain aspect ratio
    let thumb = img.thumbnail(200, 400);
    let mut buf = Vec::new();
    thumb
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Jpeg)
        .map_err(|e| format!("缩略图生成失败: {}", e))?;
    let thumbnail = format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&buf)
    );

    let isbn = scan_ean13(path);
    Ok(ScanResult { isbn, thumbnail })
}

fn scan_ean13(path: &str) -> Option<String> {
    let result = rxing::helpers::detect_in_file(
        path,
        Some(rxing::BarcodeFormat::EAN_13),
    )
    .ok()?;
    let t = result.getText().trim();
    if t.len() == 13
        && (t.starts_with("978") || t.starts_with("979"))
        && isbn13_valid(t)
    {
        return Some(t.to_string());
    }
    None
}

fn isbn13_valid(s: &str) -> bool {
    let d: Vec<u32> = s.chars().filter_map(|c| c.to_digit(10)).collect();
    if d.len() != 13 {
        return false;
    }
    let sum: u32 = d[..12]
        .iter()
        .enumerate()
        .map(|(i, &x)| if i % 2 == 0 { x } else { x * 3 })
        .sum();
    (10 - sum % 10) % 10 == d[12]
}
