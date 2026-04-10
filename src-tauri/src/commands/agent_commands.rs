// Tauri command functions and their callees are invoked via the IPC invoke handler,
// which the Rust dead_code analysis cannot see through. Suppress the false positives.
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::Arc;

use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::agent::{context, executor};
use crate::commands::error::AgentShellError;
use crate::session::SessionManager;

// ── Existing commands ─────────────────────────────────────────────────────────

/// Returns the last `line_count` lines of sanitized PTY scrollback for the
/// given session, suitable for injection into an AI prompt as context.
#[tauri::command]
pub async fn get_context(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    line_count: Option<usize>,
) -> Result<String, AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::Internal(format!("invalid session_id: {session_id}")))?;

    context::extract_context(&session_manager, id, line_count.unwrap_or(100))
        .await
        .map_err(|e| AgentShellError::Internal(e.to_string()))
}

/// Execute a command that was proposed by the AI and approved by the user.
/// Sends the command to the PTY and records it in the audit log.
#[tauri::command]
pub async fn execute_approved_command(
    session_manager: State<'_, Arc<SessionManager>>,
    session_id: String,
    command: String,
) -> Result<(), AgentShellError> {
    let id = Uuid::parse_str(&session_id)
        .map_err(|_| AgentShellError::Internal(format!("invalid session_id: {session_id}")))?;

    executor::execute_approved(&session_manager, id, command).await
}

// ── Rust-side AI streaming (bypasses WebKit network layer) ───────────────────

#[derive(Debug, serde::Deserialize, Clone)]
pub struct AiMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct AiEventPayload {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn emit_ai_event(app: &AppHandle, request_id: &str, payload: AiEventPayload) {
    let _ = app.emit(&format!("ai-event-{request_id}"), payload);
}

/// Kick off a streaming AI request from Rust, bypassing WebKit's network layer.
/// Returns immediately; results arrive as `ai-event-{requestId}` Tauri events.
#[tauri::command]
pub async fn send_ai_message(
    app: AppHandle,
    request_id: String,
    backend: String,
    api_key: Option<String>,
    model: Option<String>,
    base_url: Option<String>,
    messages: Vec<AiMessage>,
) -> Result<(), AgentShellError> {
    tokio::spawn(async move {
        let result = match backend.as_str() {
            "claude" => {
                send_claude(
                    &app,
                    &request_id,
                    api_key.unwrap_or_default(),
                    model.unwrap_or_else(|| "claude-sonnet-4-6".into()),
                    messages,
                )
                .await
            }
            "ollama" => {
                send_ollama(
                    &app,
                    &request_id,
                    base_url.unwrap_or_else(|| "http://localhost:11434".into()),
                    model.unwrap_or_else(|| "llama3".into()),
                    messages,
                )
                .await
            }
            "openai-compat" => {
                send_openai_compat(
                    &app,
                    &request_id,
                    base_url.unwrap_or_default(),
                    api_key.unwrap_or_default(),
                    model.unwrap_or_else(|| "gpt-4o".into()),
                    messages,
                )
                .await
            }
            other => Err(format!("Unknown AI backend: {other}")),
        };

        if let Err(e) = result {
            emit_ai_event(
                &app,
                &request_id,
                AiEventPayload {
                    kind: "error".into(),
                    text: None,
                    tool_name: None,
                    tool_input: None,
                    error: Some(e),
                },
            );
        }
    });

    Ok(())
}

// ── Anthropic (Claude) ────────────────────────────────────────────────────────

async fn send_claude(
    app: &AppHandle,
    request_id: &str,
    api_key: String,
    model: String,
    messages: Vec<AiMessage>,
) -> Result<(), String> {
    let body = json!({
        "model": model,
        "max_tokens": 4096,
        "stream": true,
        "tools": [{
            "name": "propose_command",
            "description": "Propose a terminal command for user approval before execution",
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "The shell command to execute" },
                    "explanation": { "type": "string", "description": "Why this command is needed" },
                    "risk_level": { "type": "string", "enum": ["safe", "caution", "destructive"] }
                },
                "required": ["command", "explanation", "risk_level"]
            }
        }],
        "messages": messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect::<Vec<_>>()
    });

    let client = Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error {status}: {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    // index → (tool_name, accumulated_json)
    let mut tool_blocks: HashMap<u64, (String, String)> = HashMap::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        loop {
            let Some(pos) = buf.find('\n') else { break };
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf = buf[pos + 1..].to_string();

            if !line.starts_with("data:") {
                continue;
            }
            let data = line["data:".len()..].trim();
            if data.is_empty() {
                continue;
            }

            let Ok(obj) = serde_json::from_str::<Value>(data) else {
                continue;
            };

            match obj.get("type").and_then(|t| t.as_str()) {
                Some("content_block_start") => {
                    let idx = obj.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                    let block = obj.get("content_block");
                    if block
                        .and_then(|b| b.get("type"))
                        .and_then(|t| t.as_str())
                        == Some("tool_use")
                    {
                        let name = block
                            .and_then(|b| b.get("name"))
                            .and_then(|n| n.as_str())
                            .unwrap_or("")
                            .to_string();
                        tool_blocks.insert(idx, (name, String::new()));
                    }
                }
                Some("content_block_delta") => {
                    let idx = obj.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                    let delta = obj.get("delta");
                    match delta
                        .and_then(|d| d.get("type"))
                        .and_then(|t| t.as_str())
                    {
                        Some("text_delta") => {
                            let text = delta
                                .and_then(|d| d.get("text"))
                                .and_then(|t| t.as_str())
                                .unwrap_or("");
                            emit_ai_event(
                                app,
                                request_id,
                                AiEventPayload {
                                    kind: "text".into(),
                                    text: Some(text.to_string()),
                                    tool_name: None,
                                    tool_input: None,
                                    error: None,
                                },
                            );
                        }
                        Some("input_json_delta") => {
                            let partial = delta
                                .and_then(|d| d.get("partial_json"))
                                .and_then(|t| t.as_str())
                                .unwrap_or("");
                            if let Some(block) = tool_blocks.get_mut(&idx) {
                                block.1.push_str(partial);
                            }
                        }
                        _ => {}
                    }
                }
                Some("content_block_stop") => {
                    let idx = obj.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
                    if let Some((name, json_str)) = tool_blocks.remove(&idx) {
                        if !name.is_empty() {
                            let tool_input: Value =
                                serde_json::from_str(&json_str).unwrap_or(Value::Null);
                            emit_ai_event(
                                app,
                                request_id,
                                AiEventPayload {
                                    kind: "tool_use".into(),
                                    text: None,
                                    tool_name: Some(name),
                                    tool_input: Some(tool_input),
                                    error: None,
                                },
                            );
                        }
                    }
                }
                Some("message_stop") => {
                    emit_ai_event(
                        app,
                        request_id,
                        AiEventPayload {
                            kind: "done".into(),
                            text: None,
                            tool_name: None,
                            tool_input: None,
                            error: None,
                        },
                    );
                    return Ok(());
                }
                _ => {}
            }
        }
    }

    emit_ai_event(
        app,
        request_id,
        AiEventPayload {
            kind: "done".into(),
            text: None,
            tool_name: None,
            tool_input: None,
            error: None,
        },
    );
    Ok(())
}

// ── Ollama ────────────────────────────────────────────────────────────────────

async fn send_ollama(
    app: &AppHandle,
    request_id: &str,
    base_url: String,
    model: String,
    messages: Vec<AiMessage>,
) -> Result<(), String> {
    let body = json!({
        "model": model,
        "messages": messages.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect::<Vec<_>>(),
        "tools": [{
            "type": "function",
            "function": {
                "name": "propose_command",
                "description": "Propose a terminal command for user approval",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string" },
                        "explanation": { "type": "string" },
                        "risk_level": { "type": "string", "enum": ["safe", "caution", "destructive"] }
                    },
                    "required": ["command", "explanation", "risk_level"]
                }
            }
        }],
        "stream": true
    });

    let base = base_url.trim_end_matches('/');
    let client = Client::new();
    let resp = client
        .post(format!("{base}/api/chat"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama error {status}: {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        loop {
            let Some(pos) = buf.find('\n') else { break };
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf = buf[pos + 1..].to_string();
            if line.trim().is_empty() {
                continue;
            }

            let Ok(obj) = serde_json::from_str::<Value>(&line) else {
                continue;
            };

            if let Some(content) = obj
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
            {
                if !content.is_empty() {
                    emit_ai_event(
                        app,
                        request_id,
                        AiEventPayload {
                            kind: "text".into(),
                            text: Some(content.to_string()),
                            tool_name: None,
                            tool_input: None,
                            error: None,
                        },
                    );
                }
            }

            if let Some(tool_calls) = obj
                .get("message")
                .and_then(|m| m.get("tool_calls"))
                .and_then(|tc| tc.as_array())
            {
                for tc in tool_calls {
                    let name = tc
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                        .unwrap_or("")
                        .to_string();
                    let args = tc
                        .get("function")
                        .and_then(|f| f.get("arguments"))
                        .cloned()
                        .unwrap_or(Value::Null);
                    emit_ai_event(
                        app,
                        request_id,
                        AiEventPayload {
                            kind: "tool_use".into(),
                            text: None,
                            tool_name: Some(name),
                            tool_input: Some(args),
                            error: None,
                        },
                    );
                }
            }

            if obj.get("done").and_then(|d| d.as_bool()) == Some(true) {
                emit_ai_event(
                    app,
                    request_id,
                    AiEventPayload {
                        kind: "done".into(),
                        text: None,
                        tool_name: None,
                        tool_input: None,
                        error: None,
                    },
                );
                return Ok(());
            }
        }
    }

    emit_ai_event(
        app,
        request_id,
        AiEventPayload {
            kind: "done".into(),
            text: None,
            tool_name: None,
            tool_input: None,
            error: None,
        },
    );
    Ok(())
}

// ── OpenAI-compatible ─────────────────────────────────────────────────────────

fn build_openai_compat_endpoint(base_url: &str) -> String {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.is_empty() {
        return String::new();
    }
    let lower = normalized.to_lowercase();
    if lower.ends_with("/chat/completions") {
        return normalized.to_string();
    }
    // ends with /v{digits}
    if let Some(slash_pos) = normalized.rfind('/') {
        let segment = &normalized[slash_pos + 1..];
        if segment.starts_with('v')
            && segment.len() > 1
            && segment[1..].chars().all(|c| c.is_ascii_digit())
        {
            return format!("{normalized}/chat/completions");
        }
    }
    format!("{normalized}/v1/chat/completions")
}

async fn send_openai_compat(
    app: &AppHandle,
    request_id: &str,
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<AiMessage>,
) -> Result<(), String> {
    let endpoint = build_openai_compat_endpoint(&base_url);
    if endpoint.is_empty() || api_key.trim().is_empty() || model.trim().is_empty() {
        emit_ai_event(
            app,
            request_id,
            AiEventPayload {
                kind: "error".into(),
                text: None,
                tool_name: None,
                tool_input: None,
                error: Some(
                    "OpenAI-compatible backend requires Base URL, API key, and model.".into(),
                ),
            },
        );
        return Ok(());
    }

    let msgs: Vec<Value> = messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();

    let tools_value = json!([{
        "type": "function",
        "function": {
            "name": "propose_command",
            "description": "Propose a terminal command for user approval",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": { "type": "string" },
                    "explanation": { "type": "string" },
                    "risk_level": { "type": "string", "enum": ["safe", "caution", "destructive"] }
                },
                "required": ["command", "explanation", "risk_level"]
            }
        }
    }]);

    let body_with_tools = json!({ "model": model, "stream": true, "messages": msgs, "tools": tools_value });
    let body_without_tools = json!({ "model": model, "stream": true, "messages": msgs });

    let client = Client::new();
    let mut resp = client
        .post(&endpoint)
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body_with_tools)
        .send()
        .await
        .map_err(|e| format!("OpenAI-compat request failed: {e}"))?;

    // Retry without tools if server signals it doesn't support them
    if [400u16, 404, 422, 501].contains(&resp.status().as_u16()) {
        let body_text = resp.text().await.unwrap_or_default();
        let haystack = body_text.to_lowercase();
        if (haystack.contains("tool") || haystack.contains("function"))
            && (haystack.contains("unsupported")
                || haystack.contains("not supported")
                || haystack.contains("unknown")
                || haystack.contains("unrecognized"))
        {
            resp = client
                .post(&endpoint)
                .header("authorization", format!("Bearer {api_key}"))
                .header("content-type", "application/json")
                .json(&body_without_tools)
                .send()
                .await
                .map_err(|e| format!("OpenAI-compat retry failed: {e}"))?;
        } else {
            return Err(format!("OpenAI-compat error: {body_text}"));
        }
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI-compat error {status}: {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    // index → (name, accumulated_args)
    let mut tool_call_bufs: HashMap<u64, (String, String)> = HashMap::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&chunk));

        loop {
            let Some(pos) = buf.find('\n') else { break };
            let line = buf[..pos].trim_end_matches('\r').to_string();
            buf = buf[pos + 1..].to_string();

            let trimmed = line.trim();
            if !trimmed.starts_with("data:") {
                continue;
            }
            let data = trimmed["data:".len()..].trim();
            if data == "[DONE]" {
                flush_tool_calls(app, request_id, tool_call_bufs);
                emit_ai_event(
                    app,
                    request_id,
                    AiEventPayload {
                        kind: "done".into(),
                        text: None,
                        tool_name: None,
                        tool_input: None,
                        error: None,
                    },
                );
                return Ok(());
            }

            let Ok(obj) = serde_json::from_str::<Value>(data) else {
                continue;
            };

            let Some(delta) = obj
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("delta"))
            else {
                continue;
            };

            if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                if !content.is_empty() {
                    emit_ai_event(
                        app,
                        request_id,
                        AiEventPayload {
                            kind: "text".into(),
                            text: Some(content.to_string()),
                            tool_name: None,
                            tool_input: None,
                            error: None,
                        },
                    );
                }
            }

            if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                for tc in tool_calls {
                    let idx = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                    let entry = tool_call_bufs
                        .entry(idx)
                        .or_insert_with(|| (String::new(), String::new()));
                    if let Some(name) = tc
                        .get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                    {
                        if !name.is_empty() {
                            entry.0 = name.to_string();
                        }
                    }
                    if let Some(args) = tc
                        .get("function")
                        .and_then(|f| f.get("arguments"))
                        .and_then(|a| a.as_str())
                    {
                        entry.1.push_str(args);
                    }
                }
            }
        }
    }

    flush_tool_calls(app, request_id, tool_call_bufs);
    emit_ai_event(
        app,
        request_id,
        AiEventPayload {
            kind: "done".into(),
            text: None,
            tool_name: None,
            tool_input: None,
            error: None,
        },
    );
    Ok(())
}

fn flush_tool_calls(
    app: &AppHandle,
    request_id: &str,
    tool_call_bufs: HashMap<u64, (String, String)>,
) {
    let mut entries: Vec<_> = tool_call_bufs.into_iter().collect();
    entries.sort_by_key(|(idx, _)| *idx);
    for (_, (name, args_buf)) in entries {
        if name.is_empty() {
            continue;
        }
        let tool_input: Value = serde_json::from_str(&args_buf).unwrap_or(Value::Null);
        emit_ai_event(
            app,
            request_id,
            AiEventPayload {
                kind: "tool_use".into(),
                text: None,
                tool_name: Some(name),
                tool_input: Some(tool_input),
                error: None,
            },
        );
    }
}
