use crate::config::AppConfig;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct Request {
    model: String,
    max_tokens: u32,
    messages: Vec<Message>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct Response {
    content: Vec<ContentBlock>,
}

pub async fn call_claude(prompt: &str, cfg: &AppConfig) -> Result<String> {
    let api_key = cfg
        .anthropic_api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .ok_or_else(|| anyhow!("未配置 Anthropic API Key，请在设置页填写"))?;

    let base_url = cfg
        .llm_base_url
        .as_deref()
        .filter(|u| !u.is_empty())
        .unwrap_or("https://api.anthropic.com");

    let model = cfg
        .llm_model
        .as_deref()
        .filter(|m| !m.is_empty())
        .unwrap_or("claude-sonnet-4-6");

    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    let req = Request {
        model: model.to_string(),
        max_tokens: 8192,
        messages: vec![Message {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&req)
        .send()
        .await?;

    let status = resp.status();
    let raw = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(anyhow!("API 错误 {}: {}", status, raw));
    }

    let body: Response = serde_json::from_str(&raw)
        .map_err(|e| anyhow!("响应解析失败: {}", e))?;
    let text = body
        .content
        .into_iter()
        .find(|b| b.block_type == "text")
        .and_then(|b| b.text)
        .ok_or_else(|| anyhow!("空响应（模型未返回文本，可能 max_tokens 不足）"))?;

    Ok(text)
}

/// Extract the first complete JSON array from a string using bracket matching.
pub fn extract_json_array(s: &str) -> &str {
    extract_delimited(s, b'[', b']')
}

/// Extract the first complete JSON object from a string using bracket matching.
pub fn extract_json_object(s: &str) -> &str {
    extract_delimited(s, b'{', b'}')
}

fn extract_delimited(s: &str, open: u8, close: u8) -> &str {
    let bytes = s.as_bytes();
    let start = match bytes.iter().position(|&b| b == open) {
        Some(i) => i,
        None => return s.trim(),
    };
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (i, &b) in bytes[start..].iter().enumerate() {
        if escape { escape = false; continue; }
        if in_str {
            if b == b'\\' { escape = true; }
            else if b == b'"' { in_str = false; }
            continue;
        }
        if b == b'"' { in_str = true; continue; }
        if b == open { depth += 1; }
        else if b == close {
            depth -= 1;
            if depth == 0 {
                return &s[start..start + i + 1];
            }
        }
    }
    s.trim()
}
