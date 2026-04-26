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

    let isbn = scan_ean13_multi(&img);
    Ok(ScanResult { isbn, thumbnail })
}

/// 转灰度后做线性对比度拉伸，依次尝试 0° / 90° / 180° / 270° 四个方向
fn scan_ean13_multi(img: &image::DynamicImage) -> Option<String> {
    let gray = img.to_luma8();
    let enhanced = enhance_contrast(&gray);

    if let Some(isbn) = try_decode_luma(&enhanced) {
        return Some(isbn);
    }
    let rot90 = image::imageops::rotate90(&enhanced);
    if let Some(isbn) = try_decode_luma(&rot90) {
        return Some(isbn);
    }
    let rot180 = image::imageops::rotate180(&enhanced);
    if let Some(isbn) = try_decode_luma(&rot180) {
        return Some(isbn);
    }
    let rot270 = image::imageops::rotate270(&enhanced);
    if let Some(isbn) = try_decode_luma(&rot270) {
        return Some(isbn);
    }
    None
}

/// 线性对比度拉伸：将像素值范围 [min, max] 映射到 [0, 255]
fn enhance_contrast(gray: &image::GrayImage) -> image::GrayImage {
    let (min, max) = gray.pixels().fold((u8::MAX, u8::MIN), |(lo, hi), p| {
        (lo.min(p[0]), hi.max(p[0]))
    });
    if max <= min {
        return gray.clone();
    }
    let range = (max - min) as f32;
    image::GrayImage::from_fn(gray.width(), gray.height(), |x, y| {
        let v = gray.get_pixel(x, y)[0];
        let stretched = ((v - min) as f32 / range * 255.0).round() as u8;
        image::Luma([stretched])
    })
}

fn try_decode_luma(gray: &image::GrayImage) -> Option<String> {
    let (w, h) = gray.dimensions();
    let luma: Vec<u8> = gray.pixels().map(|p| p[0]).collect();
    let result = rxing::helpers::detect_in_luma(luma, w, h, Some(rxing::BarcodeFormat::EAN_13)).ok()?;
    let t = result.getText().trim();
    if t.len() == 13
        && (t.starts_with("978") || t.starts_with("979"))
        && isbn13_valid(t)
    {
        Some(t.to_string())
    } else {
        None
    }
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
