//! Headless Claude Code process management
//!
//! Spawns Claude CLI in headless mode with JSON streaming output,
//! parses the JSON messages, and emits Tauri events to the frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

/// Registry of running Claude processes, keyed by session_id
static PROCESSES: once_cell::sync::Lazy<Mutex<HashMap<String, ClaudeProcess>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

/// A running Claude process with its stdin channel
struct ClaudeProcess {
    stdin_tx: mpsc::UnboundedSender<String>,
    // We don't store the Child directly since it's moved to the spawned thread
}

/// JSON message types from Claude's stream-json output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeMessage {
    #[serde(rename = "system")]
    System {
        subtype: String,
        #[serde(default)]
        session_id: Option<String>,
        #[serde(default)]
        tools: Option<serde_json::Value>,
        #[serde(default)]
        mcp_servers: Option<serde_json::Value>,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "user")]
    User {
        message: serde_json::Value,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "assistant")]
    Assistant {
        message: AssistantMessage,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "result")]
    Result {
        subtype: String,
        #[serde(default)]
        result: Option<String>,
        #[serde(default)]
        total_cost_usd: Option<f64>,
        #[serde(default)]
        duration_ms: Option<f64>,
        #[serde(default)]
        duration_api_ms: Option<f64>,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
}

/// Assistant message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantMessage {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    pub content: Vec<ContentBlock>,
    #[serde(default)]
    pub stop_reason: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Content block in assistant messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text {
        text: String,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        #[serde(default)]
        content: Option<serde_json::Value>,
        #[serde(default)]
        is_error: Option<bool>,
        #[serde(flatten)]
        extra: HashMap<String, serde_json::Value>,
    },
    #[serde(other)]
    Unknown,
}

/// Event payload sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct ClaudeEvent {
    pub session_id: String,
    pub message: ClaudeMessage,
}

/// Error event sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct ClaudeError {
    pub session_id: String,
    pub error: String,
}

/// Done event sent to frontend
#[derive(Debug, Clone, Serialize)]
pub struct ClaudeDone {
    pub session_id: String,
    pub exit_code: Option<i32>,
}

/// Start a new Claude headless session
#[tauri::command]
pub async fn start_claude_headless(
    app: AppHandle,
    session_id: String,
    prompt: String,
    cwd: String,
    resume_id: Option<String>,
) -> Result<(), String> {
    // Check if process already running for this session
    {
        let processes = PROCESSES.lock().map_err(|e| e.to_string())?;
        if processes.contains_key(&session_id) {
            return Err(format!("Claude process already running for session {}", session_id));
        }
    }

    // Build command - use full path to claude
    // Try common paths for claude binary
    let claude_path = if std::path::Path::new("/opt/homebrew/bin/claude").exists() {
        "/opt/homebrew/bin/claude"
    } else if std::path::Path::new("/usr/local/bin/claude").exists() {
        "/usr/local/bin/claude"
    } else {
        "claude" // fallback to PATH
    };

    println!("[ClaudeHeadless] Using claude at: {}", claude_path);

    let mut cmd = Command::new(claude_path);
    // --print (-p) means print response and exit
    // prompt is passed as positional argument at the end
    cmd.args(["--print", "--output-format", "stream-json", "--verbose"]);

    // Add resume flag if continuing a previous session
    if let Some(ref id) = resume_id {
        cmd.args(["--resume", id]);
    }

    // Add the prompt as a positional argument at the end
    cmd.arg(&prompt);

    println!("[ClaudeHeadless] Running: {} --print --output-format stream-json --verbose '{}'", claude_path, &prompt[..prompt.len().min(50)]);

    // Inherit all environment variables from parent, then override specific ones
    cmd.current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .envs(std::env::vars()) // Inherit ALL parent environment
        .env("TERM", "xterm-256color")
        .env("LANG", "en_US.UTF-8")
        .env("LC_ALL", "en_US.UTF-8");

    // Spawn process
    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude: {}", e))?;
    println!("[ClaudeHeadless] Spawned process with PID: {:?}", child.id());

    // Take stdin - we'll drop it immediately for --print mode
    // (Claude doesn't need stdin in print mode)
    let stdin = child.stdin.take();
    drop(stdin); // Close stdin to signal we won't send more input
    println!("[ClaudeHeadless] Closed stdin (not needed for --print mode)");

    // Create channel for sending input to stdin (for future multi-turn support)
    let (stdin_tx, _stdin_rx) = mpsc::unbounded_channel::<String>();

    // Store process reference
    {
        let mut processes = PROCESSES.lock().map_err(|e| e.to_string())?;
        processes.insert(session_id.clone(), ClaudeProcess { stdin_tx });
    }

    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    // Take stdout for reading
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    // Take stderr for error handling
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let session_id_stdout = session_id.clone();
    let app_stdout = app.clone();

    // Spawn stdout reader thread
    std::thread::spawn(move || {
        println!("[ClaudeHeadless] stdout reader thread started");
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) if line.is_empty() => {
                    println!("[ClaudeHeadless] Skipping empty line");
                    continue;
                },
                Ok(line) => {
                    println!("[ClaudeHeadless] Got line: {}", &line[..line.len().min(200)]);
                    // Parse JSON line
                    match serde_json::from_str::<ClaudeMessage>(&line) {
                        Ok(msg) => {
                            println!("[ClaudeHeadless] Parsed message type: {:?}", msg);
                            let event = ClaudeEvent {
                                session_id: session_id_stdout.clone(),
                                message: msg,
                            };
                            // Emit to frontend
                            if let Err(e) = app_stdout.emit("claude-message", &event) {
                                eprintln!("[ClaudeHeadless] Failed to emit event: {}", e);
                            }
                        }
                        Err(e) => {
                            // Log parse error but continue
                            eprintln!("[ClaudeHeadless] JSON parse error: {} for line: {}", e, line);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[ClaudeHeadless] Read error: {}", e);
                    break;
                }
            }
        }
    });

    let session_id_stderr = session_id.clone();
    let app_stderr = app.clone();

    // Spawn stderr reader thread
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) if line.is_empty() => continue,
                Ok(line) => {
                    // Emit stderr as error event
                    let error = ClaudeError {
                        session_id: session_id_stderr.clone(),
                        error: line,
                    };
                    if let Err(e) = app_stderr.emit("claude-stderr", &error) {
                        eprintln!("[ClaudeHeadless] Failed to emit stderr event: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("[ClaudeHeadless] Stderr read error: {}", e);
                    break;
                }
            }
        }
    });

    // Spawn thread to wait for process exit
    std::thread::spawn(move || {
        let exit_status = child.wait();
        let exit_code = exit_status.ok().and_then(|s| s.code());

        // Remove from registry
        {
            if let Ok(mut processes) = PROCESSES.lock() {
                processes.remove(&session_id_clone);
            }
        }

        // Emit done event
        let done = ClaudeDone {
            session_id: session_id_clone.clone(),
            exit_code,
        };
        if let Err(e) = app_clone.emit("claude-done", &done) {
            eprintln!("[ClaudeHeadless] Failed to emit done event: {}", e);
        }
    });

    Ok(())
}

/// Send input to a running Claude session (for multi-turn conversations)
#[tauri::command]
pub async fn send_claude_input(session_id: String, input: String) -> Result<(), String> {
    let processes = PROCESSES.lock().map_err(|e| e.to_string())?;

    let process = processes
        .get(&session_id)
        .ok_or_else(|| format!("No running Claude process for session {}", session_id))?;

    process
        .stdin_tx
        .send(input)
        .map_err(|e| format!("Failed to send input: {}", e))?;

    Ok(())
}

/// Stop a running Claude session
#[tauri::command]
pub async fn stop_claude_session(session_id: String) -> Result<(), String> {
    let mut processes = PROCESSES.lock().map_err(|e| e.to_string())?;

    if processes.remove(&session_id).is_some() {
        // Dropping the process will close stdin, which should terminate claude
        Ok(())
    } else {
        Err(format!("No running Claude process for session {}", session_id))
    }
}

/// Check if a Claude session is running
#[tauri::command]
pub async fn is_claude_running(session_id: String) -> Result<bool, String> {
    let processes = PROCESSES.lock().map_err(|e| e.to_string())?;
    Ok(processes.contains_key(&session_id))
}

/// Get list of all running Claude session IDs
#[tauri::command]
pub async fn get_running_claude_sessions() -> Result<Vec<String>, String> {
    let processes = PROCESSES.lock().map_err(|e| e.to_string())?;
    Ok(processes.keys().cloned().collect())
}
