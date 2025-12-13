//! Load messages from Claude Code's session storage
//!
//! Claude Code stores sessions at:
//! ~/.claude/projects/[encoded-path]/[session-uuid].jsonl
//!
//! Path encoding: slashes become dashes (e.g., /Users/samb -> -Users-samb)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

/// A message from Claude's session storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSessionMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub uuid: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(rename = "sessionId")]
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub message: Option<MessageContent>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Message content structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageContent {
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub content: serde_json::Value,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Output message for frontend
#[derive(Debug, Clone, Serialize)]
pub struct SessionMessage {
    pub id: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub content: serde_json::Value,
    pub timestamp: Option<String>,
    pub model: Option<String>,
}

/// Encode a project path like Claude Code does
/// /Users/samb/path -> -Users-samb-path
fn encode_project_path(path: &str) -> String {
    path.replace('/', "-")
}

/// Get the Claude projects directory
fn get_claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".claude").join("projects"))
}

/// Find session file for a given session ID and project path
fn find_session_file(session_id: &str, project_path: &str) -> Option<PathBuf> {
    let projects_dir = get_claude_projects_dir()?;
    let encoded_path = encode_project_path(project_path);
    let session_dir = projects_dir.join(&encoded_path);

    if !session_dir.exists() {
        eprintln!("[ClaudeSessions] Session directory not found: {:?}", session_dir);
        return None;
    }

    let session_file = session_dir.join(format!("{}.jsonl", session_id));
    if session_file.exists() {
        Some(session_file)
    } else {
        eprintln!("[ClaudeSessions] Session file not found: {:?}", session_file);
        None
    }
}

/// Load messages from a Claude session file
#[tauri::command]
pub async fn load_claude_session_messages(
    claude_session_id: String,
    project_path: String,
) -> Result<Vec<SessionMessage>, String> {
    let session_file = find_session_file(&claude_session_id, &project_path)
        .ok_or_else(|| format!("Session file not found for {}", claude_session_id))?;

    println!("[ClaudeSessions] Loading messages from: {:?}", session_file);

    let file = File::open(&session_file)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[ClaudeSessions] Error reading line: {}", e);
                continue;
            }
        };

        if line.is_empty() {
            continue;
        }

        // Parse the line as JSON
        let msg: ClaudeSessionMessage = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(e) => {
                // Skip non-message lines (like file-history-snapshot)
                if !line.contains("\"type\":\"user\"") && !line.contains("\"type\":\"assistant\"") {
                    continue;
                }
                eprintln!("[ClaudeSessions] Parse error: {} for line: {}", e, &line[..line.len().min(100)]);
                continue;
            }
        };

        // Only process user and assistant messages
        if msg.msg_type != "user" && msg.msg_type != "assistant" {
            continue;
        }

        // Skip messages without content
        let message_content = match &msg.message {
            Some(m) => m,
            None => continue,
        };

        // Convert to our output format
        let session_msg = SessionMessage {
            id: msg.uuid.unwrap_or_else(|| format!("{}-{}", msg.msg_type, messages.len())),
            msg_type: msg.msg_type,
            content: message_content.content.clone(),
            timestamp: msg.timestamp,
            model: message_content.model.clone(),
        };

        messages.push(session_msg);
    }

    println!("[ClaudeSessions] Loaded {} messages", messages.len());
    Ok(messages)
}

/// List all sessions for a project path
#[tauri::command]
pub async fn list_claude_sessions(project_path: String) -> Result<Vec<String>, String> {
    let projects_dir = get_claude_projects_dir()
        .ok_or_else(|| "Could not find Claude projects directory".to_string())?;

    let encoded_path = encode_project_path(&project_path);
    let session_dir = projects_dir.join(&encoded_path);

    if !session_dir.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    let entries = std::fs::read_dir(&session_dir)
        .map_err(|e| format!("Failed to read session directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "jsonl") {
            if let Some(stem) = path.file_stem() {
                sessions.push(stem.to_string_lossy().to_string());
            }
        }
    }

    Ok(sessions)
}
