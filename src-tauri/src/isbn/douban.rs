use super::BookMeta;
use anyhow::Result;
use scraper::{Html, Selector};
use std::collections::HashMap;
use std::time::Duration;

const SEL_TITLE:  &str = "h1 span[property='v:itemreviewed'], h1 span";
const SEL_COVER:  &str = "#mainpic img";
const SEL_INFO:   &str = "#info";
const SEL_DESC:   &str = "#link-report .intro p, #link-report p";
const SEL_RATING: &str = "strong[property='v:average']";

/// Resolve ISBN or Douban subject URL/ID to a fetchable URL.
/// Accepts:
///   - ISBN string         → https://book.douban.com/isbn/{isbn}/
///   - Douban subject URL  → https://book.douban.com/subject/{id}/  (extracted from URL)
fn resolve_url(isbn_or_url: &str) -> String {
    if let Some(idx) = isbn_or_url.find("subject/") {
        let after = &isbn_or_url[idx + 8..];
        let id = after.trim_end_matches('/').split('/').next().unwrap_or("");
        if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
            return format!("https://book.douban.com/subject/{}/", id);
        }
    }
    format!("https://book.douban.com/isbn/{}/", isbn_or_url)
}

pub async fn fetch(isbn_or_url: &str, cookie: Option<&str>) -> Result<BookMeta> {
    let url = resolve_url(isbn_or_url);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(15))
        .build()?;

    let mut req = client
        .get(&url)
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Referer", "https://book.douban.com/");
    if let Some(c) = cookie.filter(|s| !s.trim().is_empty()) {
        req = req.header("Cookie", c.trim());
    }
    let resp = req.send().await?;

    if !resp.status().is_success() {
        return Ok(BookMeta::default());
    }

    let html = resp.text().await?;
    let doc = Html::parse_document(&html);

    // 书名
    let title_sel = Selector::parse(SEL_TITLE).unwrap();
    let title = doc
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty());

    if title.is_none() {
        return Ok(BookMeta::default());
    }

    // 封面
    let cover_sel = Selector::parse(SEL_COVER).unwrap();
    let cover_url = doc
        .select(&cover_sel)
        .next()
        .and_then(|e| e.value().attr("src"))
        .map(|s| s.to_string());

    // 解析 #info：收集所有非空文本节点，相邻的「标签:」和「值」成对出现
    let fields = parse_info(&doc);

    let raw_author = fields.get("作者").or_else(|| fields.get("作  者")).cloned();
    let (author, region) = parse_author_nationality(raw_author.as_deref());
    let translator = fields.get("译者").or_else(|| fields.get("译  者"))
        .map(|s| strip_nationality(s));
    let publisher = fields.get("出版社").cloned();
    let pub_date = fields
        .get("出版年")
        .and_then(|s| super::normalize_date(s));

    // 豆瓣评分 → 1-5 星
    let rating_sel = Selector::parse(SEL_RATING).unwrap();
    let rating = doc
        .select(&rating_sel)
        .next()
        .and_then(|e| e.text().next())
        .and_then(|t| t.trim().parse::<f32>().ok())
        .map(|score| ((score / 2.0).round() as i32).clamp(1, 5));

    // 简介
    let desc_sel = Selector::parse(SEL_DESC).unwrap();
    let description = doc
        .select(&desc_sel)
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    // Prefer ISBN parsed from the page; fall back to the parameter if it looks like an ISBN
    let isbn_val = fields.get("ISBN").cloned().or_else(|| {
        let s = isbn_or_url.trim();
        if s.chars().all(|c| c.is_ascii_digit()) && (s.len() == 10 || s.len() == 13) {
            Some(s.to_string())
        } else {
            None
        }
    });

    Ok(BookMeta {
        title,
        author,
        translator,
        publisher,
        pub_date,
        cover_url,
        description: if description.is_empty() { None } else { Some(description) },
        language: Some("中文".to_string()),
        region,
        category: None,
        isbn: isbn_val,
        rating,
    })
}

/// 从 #info 收集有序文本节点，连续的「标签:」→「值」解析为 HashMap
fn parse_info(doc: &Html) -> HashMap<String, String> {
    let info_sel = Selector::parse(SEL_INFO).unwrap();
    let mut fields = HashMap::new();

    let Some(info) = doc.select(&info_sel).next() else {
        return fields;
    };

    // 收集所有非空白文本节点（保留顺序）
    // &nbsp; 解析为 \u{a0}，标准 trim() 不处理，需手动过滤
    // 保留 "/" —— 它是多位作者/译者之间的分隔符
    let raw: Vec<String> = info
        .text()
        .map(|t| t.trim_matches(|c: char| c.is_whitespace() || c == '\u{a0}').to_string())
        .filter(|t| !t.is_empty())
        .collect();

    // 豆瓣有时把冒号放在 <span> 外面，变成独立的 ":" token，合并到前一个 token
    let mut tokens: Vec<String> = Vec::with_capacity(raw.len());
    for tok in raw {
        if (tok == ":" || tok == "：") && !tokens.is_empty() {
            tokens.last_mut().unwrap().push_str(&tok);
        } else {
            tokens.push(tok);
        }
    }

    let is_label = |s: &str| s.ends_with(':') || s.ends_with('：');

    let mut i = 0;
    while i < tokens.len() {
        let tok = &tokens[i];
        if !is_label(tok) {
            i += 1;
            continue;
        }
        let label = tok
            .trim_end_matches(':')
            .trim_end_matches('：')
            .trim()
            .to_string();

        // 收集该标签后所有连续非标签 token，去掉纯 "/" 分隔符后以 " / " 拼接
        let mut j = i + 1;
        let mut parts: Vec<String> = Vec::new();
        while j < tokens.len() && !is_label(&tokens[j]) {
            let t = tokens[j].trim().to_string();
            if t != "/" {
                parts.push(t);
            }
            j += 1;
        }
        if !parts.is_empty() {
            fields.insert(label, parts.join(" / "));
        }
        i = j;
    }

    fields
}

/// 解析作者字符串，支持多人（以 " / " 分隔），每人可带 `[国籍]` 前缀
/// 返回 (干净作者名列表拼接, 第一个识别到的地域)
fn parse_author_nationality(raw: Option<&str>) -> (Option<String>, Option<String>) {
    let Some(s) = raw else {
        return (None, None);
    };

    let mut names: Vec<String> = Vec::new();
    let mut region: Option<String> = None;

    for part in s.split('/') {
        let part = part.trim();
        if let Some((abbr, name)) = extract_nationality_prefix(part) {
            if region.is_none() {
                region = nationality_to_region(abbr);
            }
            if !name.is_empty() { names.push(name.to_string()); }
        } else if !part.is_empty() {
            names.push(part.to_string());
        }
    }

    let author = if names.is_empty() { None } else { Some(names.join(" / ")) };
    (author, region)
}

/// 仅去掉国籍前缀，支持多人（用于译者）
fn strip_nationality(s: &str) -> String {
    s.split('/')
        .map(|part| {
            let part = part.trim();
            if let Some((_abbr, name)) = extract_nationality_prefix(part) {
                name.to_string()
            } else {
                part.to_string()
            }
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" / ")
}

/// 识别 `[国籍] 姓名`、`(国籍) 姓名`、`［国籍］姓名`、`（国籍）姓名` 前缀，返回 (缩写, 姓名)
/// 豆瓣不同页面混用 ASCII 和全角括号，需全部兼容
fn extract_nationality_prefix(s: &str) -> Option<(&str, &str)> {
    let s = s.trim();
    let (open, close): (&str, &str) =
        if s.starts_with('[')  { ("[",  "]")  }
        else if s.starts_with('(')  { ("(",  ")")  }
        else if s.starts_with('［') { ("［", "］") }
        else if s.starts_with('（') { ("（", "）") }
        else { return None; };
    let inner = s.strip_prefix(open)?;
    let end = inner.find(close)?;
    let abbr = inner[..end].trim();
    let name = inner[end + close.len()..].trim();
    Some((abbr, name))
}

/// 豆瓣国籍缩写 → 完整地域名称
fn nationality_to_region(abbr: &str) -> Option<String> {
    let region = match abbr {
        "中" | "中国"                   => "中国",
        "日" | "日本"                   => "日本",
        "美" | "美国"                   => "美国",
        "英" | "英国"                   => "英国",
        "法" | "法国"                   => "法国",
        "德" | "德国"                   => "德国",
        "俄" | "苏" | "俄罗斯"          => "俄罗斯",
        "意" | "意大利"                  => "意大利",
        "西" | "西班牙"                  => "西班牙",
        "奥" | "奥地利"                  => "奥地利",
        "加" | "加拿大"                  => "加拿大",
        "澳" | "澳大利亚"                => "澳大利亚",
        "韩" | "韩国"                   => "韩国",
        "印" | "印度"                   => "印度",
        "挪" | "挪威"                   => "挪威",
        "瑞典"                          => "瑞典",
        "瑞" | "瑞士"                   => "瑞士",
        "荷" | "荷兰"                   => "荷兰",
        "比" | "比利时"                  => "比利时",
        "捷" | "捷克"                   => "捷克",
        "波" | "波兰"                   => "波兰",
        "匈" | "匈牙利"                  => "匈牙利",
        "罗" | "罗马尼亚"                => "罗马尼亚",
        "葡" | "葡萄牙"                  => "葡萄牙",
        "丹" | "丹麦"                   => "丹麦",
        "芬" | "芬兰"                   => "芬兰",
        "哥伦" | "哥伦比亚"              => "哥伦比亚",
        "阿根廷"                        => "阿根廷",
        "巴西"                          => "巴西",
        "墨" | "墨西哥"                  => "墨西哥",
        "秘" | "秘鲁"                   => "秘鲁",
        "爱尔兰"                        => "爱尔兰",
        "以色列"                        => "以色列",
        "土" | "土耳其"                  => "土耳其",
        "埃" | "埃及"                   => "埃及",
        "南非"                          => "南非",
        "新西兰"                        => "新西兰",
        "新加坡"                        => "新加坡",
        "泰" | "泰国"                   => "泰国",
        "越" | "越南"                   => "越南",
        _ => return None,
    };
    Some(region.to_string())
}
