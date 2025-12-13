mod claude_headless;
mod claude_sessions;
mod db;
mod git;
mod server;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// Types for IPC
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceData {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub script_path: Option<String>,
    pub origin_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub workspace_id: Option<String>,
    pub worktree_name: Option<String>,
    pub status: String,
    pub base_commit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxMessageData {
    pub id: String,
    pub session_id: String,
    pub session_name: String,
    pub message: String,
    pub created_at: String,
    pub read_at: Option<String>,
    pub first_read_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffCommentData {
    pub id: String,
    pub session_id: String,
    pub file_path: String,
    pub line_number: Option<i32>,
    pub line_type: Option<String>,
    pub author: String,
    pub content: String,
    pub status: String,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn comment_to_data(c: db::DiffComment) -> DiffCommentData {
    DiffCommentData {
        id: c.id,
        session_id: c.session_id,
        file_path: c.file_path,
        line_number: c.line_number,
        line_type: c.line_type,
        author: c.author,
        content: c.content,
        status: c.status,
        parent_id: c.parent_id,
        created_at: c.created_at.to_rfc3339(),
        updated_at: c.updated_at.to_rfc3339(),
    }
}

// Tauri commands for workspaces
#[tauri::command]
fn get_workspaces() -> Result<Vec<WorkspaceData>, String> {
    db::get_all_workspaces()
        .map(|workspaces| {
            workspaces
                .into_iter()
                .map(|w| WorkspaceData {
                    id: w.id,
                    name: w.name,
                    folder: w.folder,
                    script_path: w.script_path,
                    origin_branch: w.origin_branch,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_workspace(name: String, folder: String, script_path: Option<String>, origin_branch: Option<String>) -> Result<WorkspaceData, String> {
    let origin_branch = origin_branch.unwrap_or_else(|| "main".to_string());
    let workspace = db::Workspace {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        folder: folder.clone(),
        script_path: script_path.clone(),
        origin_branch: origin_branch.clone(),
        created_at: Utc::now(),
    };
    db::create_workspace(&workspace).map_err(|e| e.to_string())?;
    Ok(WorkspaceData {
        id: workspace.id,
        name,
        folder,
        script_path,
        origin_branch,
    })
}

#[tauri::command]
fn delete_workspace(id: String) -> Result<(), String> {
    db::delete_workspace(&id).map_err(|e| e.to_string())
}

// Tauri commands for sessions
#[tauri::command]
fn get_sessions() -> Result<Vec<SessionData>, String> {
    db::get_all_sessions()
        .map(|sessions| {
            sessions
                .into_iter()
                .map(|s| SessionData {
                    id: s.id,
                    name: s.name,
                    cwd: s.cwd,
                    workspace_id: s.workspace_id,
                    worktree_name: s.worktree_name,
                    status: s.status,
                    base_commit: s.base_commit,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_session(
    name: String,
    cwd: String,
    workspace_id: Option<String>,
    worktree_name: Option<String>,
    base_commit: Option<String>,
) -> Result<SessionData, String> {
    let session = db::Session {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        cwd: cwd.clone(),
        workspace_id: workspace_id.clone(),
        worktree_name: worktree_name.clone(),
        status: "busy".to_string(),
        base_commit: base_commit.clone(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    db::create_session(&session).map_err(|e| e.to_string())?;
    Ok(SessionData {
        id: session.id,
        name,
        cwd,
        workspace_id,
        worktree_name,
        status: session.status,
        base_commit,
    })
}

#[tauri::command]
fn delete_session(id: String) -> Result<(), String> {
    db::delete_session(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_session(id: String, name: String) -> Result<(), String> {
    db::rename_session(&id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_session_cwd(id: String, cwd: String) -> Result<(), String> {
    db::update_session_cwd(&id, &cwd).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_status(id: String) -> Result<String, String> {
    db::get_session(&id)
        .map_err(|e| e.to_string())?
        .map(|s| s.status)
        .ok_or_else(|| "Session not found".to_string())
}

#[tauri::command]
fn set_session_status(id: String, status: String) -> Result<(), String> {
    db::update_session_status(&id, &status).map_err(|e| e.to_string())
}

// Tauri commands for inbox messages
#[tauri::command]
fn get_inbox_messages() -> Result<Vec<InboxMessageData>, String> {
    db::get_all_inbox_messages()
        .map(|messages| {
            messages
                .into_iter()
                .map(|m| InboxMessageData {
                    id: m.id,
                    session_id: m.session_id,
                    session_name: m.session_name,
                    message: m.message,
                    created_at: m.created_at.to_rfc3339(),
                    read_at: m.read_at.map(|dt| dt.to_rfc3339()),
                    first_read_at: m.first_read_at.map(|dt| dt.to_rfc3339()),
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_inbox_message_read(id: String) -> Result<(), String> {
    db::mark_message_read(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_inbox_message_unread(id: String) -> Result<(), String> {
    db::mark_message_unread(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn mark_session_messages_read(session_id: String) -> Result<u32, String> {
    db::mark_session_messages_read(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_inbox_message(id: String) -> Result<(), String> {
    db::delete_inbox_message(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_inbox() -> Result<(), String> {
    db::clear_inbox().map_err(|e| e.to_string())
}

/// Configure a worktree directory with MCP settings for Claude Code
#[tauri::command]
fn configure_worktree(worktree_path: String, session_id: String) -> Result<(), String> {
    let path = PathBuf::from(&worktree_path);

    // Get the path to the MCP bridge script (relative to app)
    let mcp_bridge_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Could not get exe parent")?
        .join("../Resources/mcp-bridge.cjs");

    // For dev mode, use the scripts directory
    let mcp_bridge_path = if mcp_bridge_path.exists() {
        mcp_bridge_path
    } else {
        // Fallback to repo path for development
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("Could not get manifest parent")?
            .join("scripts/mcp-bridge.cjs")
    };

    let mcp_bridge_str = mcp_bridge_path.to_string_lossy().to_string();

    // Configure .mcp.json
    let mcp_json_path = path.join(".mcp.json");
    let mut mcp_config: serde_json::Value = if mcp_json_path.exists() {
        let content = std::fs::read_to_string(&mcp_json_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({"mcpServers": {}}))
    } else {
        serde_json::json!({"mcpServers": {}})
    };

    // Add our MCP server config
    if let Some(servers) = mcp_config.get_mut("mcpServers") {
        servers["claude-sessions"] = serde_json::json!({
            "command": "node",
            "args": [mcp_bridge_str],
            "env": {
                "CLAUDE_SESSIONS_ID": session_id
            }
        });
    }

    std::fs::write(&mcp_json_path, serde_json::to_string_pretty(&mcp_config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    // Configure .claude/settings.local.json
    let claude_dir = path.join(".claude");
    std::fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;

    let settings_path = claude_dir.join("settings.local.json");
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({"permissions": {"allow": []}}))
    } else {
        serde_json::json!({"permissions": {"allow": []}})
    };

    // Add our permissions
    let our_permissions = vec![
        "mcp__claude-sessions__notify_ready",
        "mcp__claude-sessions__notify_busy",
    ];

    if let Some(perms) = settings.pointer_mut("/permissions/allow") {
        if let Some(arr) = perms.as_array_mut() {
            for perm in &our_permissions {
                let perm_val = serde_json::Value::String(perm.to_string());
                if !arr.contains(&perm_val) {
                    arr.push(perm_val);
                }
            }
        }
    } else {
        settings["permissions"]["allow"] = serde_json::json!(our_permissions);
    }

    // Auto-accept only our specific MCP server without prompting
    // This adds to existing list if present, or creates new list
    if let Some(servers) = settings.get_mut("enabledMcpjsonServers") {
        if let Some(arr) = servers.as_array_mut() {
            let our_server = serde_json::Value::String("claude-sessions".to_string());
            if !arr.contains(&our_server) {
                arr.push(our_server);
            }
        }
    } else {
        settings["enabledMcpjsonServers"] = serde_json::json!(["claude-sessions"]);
    }

    std::fs::write(&settings_path, serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    println!("[Config] Configured worktree at: {}", worktree_path);
    Ok(())
}

// Git diff commands
#[tauri::command]
fn get_diff_summary(worktree_path: String, base_branch: String) -> Result<git::DiffSummary, String> {
    git::get_diff_summary(&worktree_path, &base_branch)
}

#[tauri::command]
fn get_file_diff(worktree_path: String, file_path: String, base_branch: String) -> Result<git::FileDiff, String> {
    git::get_file_diff(&worktree_path, &file_path, &base_branch)
}

#[tauri::command]
fn get_current_branch(worktree_path: String) -> Result<String, String> {
    git::get_current_branch(&worktree_path)
}

#[tauri::command]
fn get_commit_sha(worktree_path: String, ref_name: String) -> Result<String, String> {
    git::get_commit_sha(&worktree_path, &ref_name)
}

#[tauri::command]
fn update_session_base_commit(id: String, base_commit: String) -> Result<(), String> {
    db::update_session_base_commit(&id, &base_commit).map_err(|e| e.to_string())
}

#[tauri::command]
fn fetch_origin(worktree_path: String) -> Result<(), String> {
    git::fetch_origin(&worktree_path)
}

// Comment commands
#[tauri::command]
fn create_comment(
    session_id: String,
    file_path: String,
    line_number: Option<i32>,
    line_type: Option<String>,
    author: String,
    content: String,
    parent_id: Option<String>,
) -> Result<DiffCommentData, String> {
    db::create_comment(
        &session_id,
        &file_path,
        line_number,
        line_type.as_deref(),
        &author,
        &content,
        parent_id.as_deref(),
    )
    .map(comment_to_data)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_comments_for_session(session_id: String) -> Result<Vec<DiffCommentData>, String> {
    db::get_comments_for_session(&session_id)
        .map(|comments| comments.into_iter().map(comment_to_data).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_open_comments_for_session(session_id: String) -> Result<Vec<DiffCommentData>, String> {
    db::get_open_comments_for_session(&session_id)
        .map(|comments| comments.into_iter().map(comment_to_data).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn reply_to_comment(parent_id: String, author: String, content: String) -> Result<DiffCommentData, String> {
    db::reply_to_comment(&parent_id, &author, &content)
        .map(comment_to_data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resolve_comment(id: String) -> Result<(), String> {
    db::resolve_comment(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_comment(id: String) -> Result<(), String> {
    db::delete_comment(&id).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize database
    if let Err(e) = db::init_db() {
        eprintln!("[App] Failed to initialize database: {}", e);
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_workspaces,
            create_workspace,
            delete_workspace,
            get_sessions,
            create_session,
            delete_session,
            rename_session,
            update_session_cwd,
            get_session_status,
            set_session_status,
            configure_worktree,
            get_inbox_messages,
            mark_inbox_message_read,
            mark_inbox_message_unread,
            mark_session_messages_read,
            delete_inbox_message,
            clear_inbox,
            get_diff_summary,
            get_file_diff,
            get_current_branch,
            get_commit_sha,
            update_session_base_commit,
            fetch_origin,
            create_comment,
            get_comments_for_session,
            get_open_comments_for_session,
            reply_to_comment,
            resolve_comment,
            delete_comment,
            // Headless Claude commands
            claude_headless::start_claude_headless,
            claude_headless::send_claude_input,
            claude_headless::stop_claude_session,
            claude_headless::is_claude_running,
            claude_headless::get_running_claude_sessions,
            // Session persistence commands
            claude_sessions::load_claude_session_messages,
            claude_sessions::list_claude_sessions,
        ])
        .setup(|_app| {
            // Spawn HTTP server for MCP bridge in background
            tauri::async_runtime::spawn(async {
                server::start_server().await;
            });
            Ok(())
        });

    // Enable MCP bridge for AI debugging in development
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
