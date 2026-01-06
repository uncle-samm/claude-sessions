mod claude_headless;
mod claude_sessions;
mod db;
mod git;
mod permissions;
mod server;

use chrono::Utc;
use permissions::{PermissionBehavior, PermissionResponse};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

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
fn create_workspace(
    name: String,
    folder: String,
    script_path: Option<String>,
    origin_branch: Option<String>,
) -> Result<WorkspaceData, String> {
    let origin_branch = origin_branch.unwrap_or_else(|| "main".to_string());
    let workspace = db::Workspace {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.clone(),
        folder: folder.clone(),
        script_path: script_path.clone(),
        origin_branch: origin_branch.clone(),
        created_at: Utc::now(),
        convex_id: None,
        sync_status: "pending".to_string(),
        deleted_at: None,
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
        convex_id: None,
        sync_status: "pending".to_string(),
        deleted_at: None,
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

/// Configure a worktree directory for Claude Code
/// Note: MCP configuration is no longer needed - custom tools are now provided
/// directly via the SDK in agent-service. This function is kept for any future
/// worktree-specific configuration needs.
#[tauri::command]
fn configure_worktree(worktree_path: String, _session_id: String) -> Result<(), String> {
    // MCP configuration removed - custom tools (notify_ready, get_pending_comments, etc.)
    // are now provided directly to the SDK via createSdkMcpServer() in agent-service.
    // No need to write .mcp.json or .claude/settings.local.json anymore.

    println!(
        "[Config] Worktree configured at: {} (no MCP files needed)",
        worktree_path
    );
    Ok(())
}

// Git diff commands
#[tauri::command]
fn get_diff_summary(
    worktree_path: String,
    base_branch: String,
) -> Result<git::DiffSummary, String> {
    git::get_diff_summary(&worktree_path, &base_branch)
}

#[tauri::command]
fn get_file_diff(
    worktree_path: String,
    file_path: String,
    base_branch: String,
) -> Result<git::FileDiff, String> {
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
fn update_session_claude_id(id: String, claude_session_id: String) -> Result<(), String> {
    db::update_session_claude_id(&id, &claude_session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_claude_id(id: String) -> Result<Option<String>, String> {
    db::get_session_claude_id(&id).map_err(|e| e.to_string())
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
fn reply_to_comment(
    parent_id: String,
    author: String,
    content: String,
) -> Result<DiffCommentData, String> {
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

// ========== SYNC QUEUE COMMANDS ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItemData {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: String,
    pub created_at: String,
    pub attempts: i32,
    pub last_error: Option<String>,
}

fn sync_queue_item_to_data(item: db::SyncQueueItem) -> SyncQueueItemData {
    SyncQueueItemData {
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation: item.operation,
        payload: item.payload,
        created_at: item.created_at.to_rfc3339(),
        attempts: item.attempts,
        last_error: item.last_error,
    }
}

#[tauri::command]
fn add_to_sync_queue(
    entity_type: String,
    entity_id: String,
    operation: String,
    payload: String,
) -> Result<SyncQueueItemData, String> {
    db::add_to_sync_queue(&entity_type, &entity_id, &operation, &payload)
        .map(sync_queue_item_to_data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_sync_queue() -> Result<Vec<SyncQueueItemData>, String> {
    db::get_sync_queue()
        .map(|items| items.into_iter().map(sync_queue_item_to_data).collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_from_sync_queue(id: String) -> Result<(), String> {
    db::remove_from_sync_queue(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn increment_sync_attempts(id: String, error: String) -> Result<(), String> {
    db::increment_sync_attempts(&id, &error).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_unsynced_sessions() -> Result<Vec<SessionData>, String> {
    db::get_unsynced_sessions()
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
fn update_session_convex_id(id: String, convex_id: String) -> Result<(), String> {
    db::update_session_convex_id(&id, &convex_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_session_sync_status(id: String, sync_status: String) -> Result<(), String> {
    db::update_session_sync_status(&id, &sync_status).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_unsynced_workspaces() -> Result<Vec<WorkspaceData>, String> {
    db::get_unsynced_workspaces()
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
fn update_workspace_convex_id(id: String, convex_id: String) -> Result<(), String> {
    db::update_workspace_convex_id(&id, &convex_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_workspace_sync_status(id: String, sync_status: String) -> Result<(), String> {
    db::update_workspace_sync_status(&id, &sync_status).map_err(|e| e.to_string())
}

// OAuth state - stores the callback URL when received
use std::sync::Mutex;
static OAUTH_CALLBACK_URL: Mutex<Option<String>> = Mutex::new(None);

// OAuth commands
#[tauri::command]
async fn start_oauth_flow() -> Result<u16, String> {
    // Clear any previous callback URL
    if let Ok(mut url) = OAUTH_CALLBACK_URL.lock() {
        *url = None;
    }

    // Start a local server to capture OAuth callback
    // Use default config - the plugin injects JavaScript that fetches the full URL back
    // We cannot override the response as it breaks the callback mechanism
    tauri_plugin_oauth::start(move |url| {
        println!("[OAuth] Received callback URL: {}", url);
        // Store the URL for polling
        if let Ok(mut stored_url) = OAUTH_CALLBACK_URL.lock() {
            *stored_url = Some(url);
            println!("[OAuth] Stored callback URL for polling");
        }
    })
    .map_err(|e| e.to_string())
}

// Poll for OAuth callback URL
#[tauri::command]
fn poll_oauth_callback() -> Option<String> {
    if let Ok(mut url) = OAUTH_CALLBACK_URL.lock() {
        url.take() // Return and clear the URL
    } else {
        None
    }
}

// Permission commands
#[tauri::command]
fn respond_to_permission(
    request_id: String,
    behavior: String,
    message: Option<String>,
    always_allow: Option<bool>,
) -> Result<(), String> {
    let behavior = match behavior.as_str() {
        "allow" => PermissionBehavior::Allow,
        "deny" => PermissionBehavior::Deny,
        _ => return Err(format!("Invalid behavior: {}", behavior)),
    };

    let response = PermissionResponse {
        request_id: request_id.clone(),
        behavior,
        message,
        interrupt: Some(true), // Always interrupt on deny
        always_allow,
    };

    // Find and complete the pending request
    if let Some(pending) = permissions::take_pending(&request_id) {
        // Send response through the channel
        if pending.response_tx.send(response).is_err() {
            return Err("Failed to send response - request may have timed out".to_string());
        }
        Ok(())
    } else {
        Err(format!(
            "No pending permission request found for {}",
            request_id
        ))
    }
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
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
            update_session_claude_id,
            get_session_claude_id,
            fetch_origin,
            create_comment,
            get_comments_for_session,
            get_open_comments_for_session,
            reply_to_comment,
            resolve_comment,
            delete_comment,
            // Sync queue commands
            add_to_sync_queue,
            get_sync_queue,
            remove_from_sync_queue,
            increment_sync_attempts,
            get_unsynced_sessions,
            update_session_convex_id,
            update_session_sync_status,
            get_unsynced_workspaces,
            update_workspace_convex_id,
            update_workspace_sync_status,
            // Permission commands
            respond_to_permission,
            // OAuth commands
            start_oauth_flow,
            poll_oauth_callback,
            // Headless Claude commands (legacy CLI)
            claude_headless::start_claude_headless,
            claude_headless::send_claude_input,
            claude_headless::stop_claude_session,
            claude_headless::is_claude_running,
            claude_headless::get_running_claude_sessions,
            // Agent SDK sidecar command (new)
            claude_headless::start_claude_agent,
            // Session persistence commands
            claude_sessions::load_claude_session_messages,
            claude_sessions::list_claude_sessions,
        ])
        .setup(|app| {
            // Spawn HTTP server for MCP bridge in background
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                server::start_server_with_app(app_handle).await;
            });

            // Set up deep link handler for OAuth callbacks
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                // Register the deep link scheme (needed for dev mode)
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("[DeepLink] Failed to register: {}", e);
                }

                // Handle deep links opened while app is running
                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls = event.urls();
                    for url in urls {
                        println!("[DeepLink] Received: {}", url);
                        // Emit event to frontend for OAuth callback handling
                        if let Err(e) = app_handle.emit("deep-link", url.to_string()) {
                            eprintln!("[DeepLink] Failed to emit event: {}", e);
                        }
                    }
                });

                // Check if app was started via deep link
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    let app_handle = app.handle().clone();
                    for url in urls {
                        println!("[DeepLink] Started with: {}", url);
                        if let Err(e) = app_handle.emit("deep-link", url.to_string()) {
                            eprintln!("[DeepLink] Failed to emit startup event: {}", e);
                        }
                    }
                }
            }

            Ok(())
        });

    // Enable MCP bridge for AI debugging (only when feature is enabled)
    #[cfg(feature = "mcp-bridge")]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
