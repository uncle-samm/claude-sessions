//! Headless Claude Code process management
//!
//! Spawns Claude Agent SDK sidecar with JSON streaming output,
//! parses the JSON messages, and emits Tauri events to the frontend.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::ShellExt;
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
            return Err(format!(
                "Claude process already running for session {}",
                session_id
            ));
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

    println!(
        "[ClaudeHeadless] Running: {} --print --output-format stream-json --verbose '{}'",
        claude_path,
        &prompt[..prompt.len().min(50)]
    );

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
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;
    println!(
        "[ClaudeHeadless] Spawned process with PID: {:?}",
        child.id()
    );

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
                }
                Ok(line) => {
                    println!(
                        "[ClaudeHeadless] Got line: {}",
                        &line[..line.len().min(200)]
                    );
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
                            eprintln!(
                                "[ClaudeHeadless] JSON parse error: {} for line: {}",
                                e, line
                            );
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

/// Input for the agent-service sidecar
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentServiceInput {
    action: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>, // SDK session ID for resume
    #[serde(skip_serializing_if = "Option::is_none")]
    claude_sessions_id: Option<String>, // Our session ID for custom tools
    cwd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    claude_code_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<AgentServiceOptions>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentServiceOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    allowed_tools: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    permission_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mcp_servers: Option<serde_json::Value>,
}

/// Start a Claude session using the Agent SDK sidecar
#[tauri::command]
pub async fn start_claude_agent(
    app: AppHandle,
    session_id: String,
    prompt: String,
    cwd: String,
    resume_id: Option<String>,
    permission_mode: Option<String>,
) -> Result<(), String> {
    // Check if process already running for this session
    {
        let processes = PROCESSES.lock().map_err(|e| e.to_string())?;
        if processes.contains_key(&session_id) {
            return Err(format!(
                "Claude process already running for session {}",
                session_id
            ));
        }
    }

    // Find Claude Code CLI path
    let claude_code_path = if std::path::Path::new("/opt/homebrew/bin/claude").exists() {
        Some("/opt/homebrew/bin/claude".to_string())
    } else if std::path::Path::new("/usr/local/bin/claude").exists() {
        Some("/usr/local/bin/claude".to_string())
    } else {
        None // SDK will try to find it
    };

    // Build input JSON for the sidecar
    let input = AgentServiceInput {
        action: if resume_id.is_some() {
            "resume".to_string()
        } else {
            "query".to_string()
        },
        prompt,
        session_id: resume_id, // SDK session ID for resume
        claude_sessions_id: Some(session_id.clone()), // Our session ID for custom tools
        cwd: cwd.clone(),
        claude_code_path,
        options: Some(AgentServiceOptions {
            allowed_tools: None, // Use defaults
            permission_mode,
            mcp_servers: None, // Custom tools now handled via claudeSessionsId
        }),
    };

    let input_json =
        serde_json::to_string(&input).map_err(|e| format!("Failed to serialize input: {}", e))?;

    println!(
        "[ClaudeAgent] Starting sidecar with input: {}",
        &input_json[..input_json.len().min(200)]
    );

    // Get the shell plugin to spawn sidecar
    let shell = app.shell();

    // Spawn the sidecar
    let (mut rx, _child) = shell
        .sidecar("agent-service")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args([&input_json])
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Create channel for sending input (for future multi-turn support)
    let (stdin_tx, _stdin_rx) = mpsc::unbounded_channel::<String>();

    // Store process reference
    {
        let mut processes = PROCESSES.lock().map_err(|e| e.to_string())?;
        processes.insert(session_id.clone(), ClaudeProcess { stdin_tx });
    }

    let session_id_clone = session_id.clone();
    let app_clone = app.clone();

    // Spawn task to handle sidecar events
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    if line_str.is_empty() {
                        continue;
                    }
                    println!(
                        "[ClaudeAgent] stdout: {}",
                        &line_str[..line_str.len().min(200)]
                    );

                    // Parse JSON line
                    match serde_json::from_str::<ClaudeMessage>(&line_str) {
                        Ok(msg) => {
                            let event = ClaudeEvent {
                                session_id: session_id_clone.clone(),
                                message: msg,
                            };
                            if let Err(e) = app_clone.emit("claude-message", &event) {
                                eprintln!("[ClaudeAgent] Failed to emit event: {}", e);
                            }
                        }
                        Err(e) => {
                            eprintln!(
                                "[ClaudeAgent] JSON parse error: {} for line: {}",
                                e, line_str
                            );
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    if line_str.is_empty() {
                        continue;
                    }
                    eprintln!("[ClaudeAgent] stderr: {}", line_str);

                    let error = ClaudeError {
                        session_id: session_id_clone.clone(),
                        error: line_str.to_string(),
                    };
                    if let Err(e) = app_clone.emit("claude-stderr", &error) {
                        eprintln!("[ClaudeAgent] Failed to emit stderr event: {}", e);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    println!(
                        "[ClaudeAgent] Process terminated with code: {:?}",
                        payload.code
                    );

                    // Remove from registry
                    if let Ok(mut processes) = PROCESSES.lock() {
                        processes.remove(&session_id_clone);
                    }

                    // Emit done event
                    let done = ClaudeDone {
                        session_id: session_id_clone.clone(),
                        exit_code: payload.code,
                    };
                    if let Err(e) = app_clone.emit("claude-done", &done) {
                        eprintln!("[ClaudeAgent] Failed to emit done event: {}", e);
                    }
                    break;
                }
                _ => {}
            }
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
        Err(format!(
            "No running Claude process for session {}",
            session_id
        ))
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
