use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};

use crate::db;
use crate::permissions::{
    self, PendingPermission, PermissionBehavior, PermissionRequest, PermissionResponse,
};

const SERVER_PORT: u16 = 19420;

#[derive(Debug, Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StatusUpdate {
    status: String,
}

#[derive(Debug, Deserialize)]
struct MessagePayload {
    message: String,
}

#[derive(Debug, Serialize)]
struct InboxMessageInfo {
    id: String,
    session_id: String,
    session_name: String,
    message: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct SessionInfo {
    id: String,
    name: String,
    status: String,
}

#[derive(Debug, Serialize)]
struct CommentInfo {
    id: String,
    session_id: String,
    file_path: String,
    line_number: Option<i32>,
    line_type: Option<String>,
    author: String,
    content: String,
    status: String,
    parent_id: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct CommentsResponse {
    success: bool,
    comments: Vec<CommentInfo>,
}

#[derive(Debug, Deserialize)]
struct ReplyPayload {
    message: String,
}

#[derive(Debug, Deserialize)]
struct ResolvePayload {}

// GET /api/session/:id - Get session info
async fn get_session(Path(id): Path<String>) -> (StatusCode, Json<ApiResponse<SessionInfo>>) {
    match db::get_session(&id) {
        Ok(Some(session)) => (
            StatusCode::OK,
            Json(ApiResponse {
                success: true,
                data: Some(SessionInfo {
                    id: session.id,
                    name: session.name,
                    status: session.status,
                }),
                error: None,
            }),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some("Session not found".to_string()),
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }),
        ),
    }
}

// POST /api/session/:id/status - Update session status
async fn update_status(
    Path(id): Path<String>,
    Json(payload): Json<StatusUpdate>,
) -> (StatusCode, Json<ApiResponse<()>>) {
    // Validate status
    if payload.status != "ready" && payload.status != "busy" {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some("Status must be 'ready' or 'busy'".to_string()),
            }),
        );
    }

    match db::update_session_status(&id, &payload.status) {
        Ok(_) => {
            println!(
                "[Server] Session {} status updated to: {}",
                id, payload.status
            );
            (
                StatusCode::OK,
                Json(ApiResponse {
                    success: true,
                    data: Some(()),
                    error: None,
                }),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }),
        ),
    }
}

// GET /api/health - Health check
async fn health_check() -> (StatusCode, Json<ApiResponse<String>>) {
    (
        StatusCode::OK,
        Json(ApiResponse {
            success: true,
            data: Some("Claude Sessions API is running".to_string()),
            error: None,
        }),
    )
}

// POST /api/session/:id/message - Send message to inbox and set status to ready
async fn send_message(
    Path(id): Path<String>,
    Json(payload): Json<MessagePayload>,
) -> (StatusCode, Json<ApiResponse<InboxMessageInfo>>) {
    // Create inbox message
    match db::create_inbox_message(&id, &payload.message) {
        Ok(msg) => {
            // Also update session status to ready
            let _ = db::update_session_status(&id, "ready");

            println!("[Server] Session {} sent message: {}", id, payload.message);
            (
                StatusCode::OK,
                Json(ApiResponse {
                    success: true,
                    data: Some(InboxMessageInfo {
                        id: msg.id,
                        session_id: msg.session_id,
                        session_name: msg.session_name,
                        message: msg.message,
                        created_at: msg.created_at.to_rfc3339(),
                    }),
                    error: None,
                }),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }),
        ),
    }
}

// GET /api/session/:id/comments - Get open comments for session
async fn get_comments(Path(id): Path<String>) -> (StatusCode, Json<CommentsResponse>) {
    match db::get_open_comments_for_session(&id) {
        Ok(comments) => {
            let comment_infos: Vec<CommentInfo> = comments
                .into_iter()
                .map(|c| CommentInfo {
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
                })
                .collect();
            println!(
                "[Server] Session {} has {} open comments",
                id,
                comment_infos.len()
            );
            (
                StatusCode::OK,
                Json(CommentsResponse {
                    success: true,
                    comments: comment_infos,
                }),
            )
        }
        Err(e) => {
            println!("[Server] Error getting comments for session {}: {}", id, e);
            (
                StatusCode::OK,
                Json(CommentsResponse {
                    success: false,
                    comments: vec![],
                }),
            )
        }
    }
}

// POST /api/session/:id/comments/:comment_id/reply - Reply to a comment
async fn reply_to_comment_handler(
    Path((session_id, comment_id)): Path<(String, String)>,
    Json(payload): Json<ReplyPayload>,
) -> (StatusCode, Json<ApiResponse<CommentInfo>>) {
    // Use the session name as the author (Claude's session)
    let author = match db::get_session(&session_id) {
        Ok(Some(session)) => session.name,
        _ => session_id.clone(),
    };

    match db::reply_to_comment(&comment_id, &author, &payload.message) {
        Ok(comment) => {
            println!(
                "[Server] Reply added to comment {} by {}",
                comment_id, author
            );
            (
                StatusCode::OK,
                Json(ApiResponse {
                    success: true,
                    data: Some(CommentInfo {
                        id: comment.id,
                        session_id: comment.session_id,
                        file_path: comment.file_path,
                        line_number: comment.line_number,
                        line_type: comment.line_type,
                        author: comment.author,
                        content: comment.content,
                        status: comment.status,
                        parent_id: comment.parent_id,
                        created_at: comment.created_at.to_rfc3339(),
                    }),
                    error: None,
                }),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }),
        ),
    }
}

// POST /api/session/:id/comments/:comment_id/resolve - Resolve a comment
async fn resolve_comment_handler(
    Path((_session_id, comment_id)): Path<(String, String)>,
    Json(_payload): Json<ResolvePayload>,
) -> (StatusCode, Json<ApiResponse<()>>) {
    match db::resolve_comment(&comment_id) {
        Ok(_) => {
            println!("[Server] Comment {} resolved", comment_id);
            (
                StatusCode::OK,
                Json(ApiResponse {
                    success: true,
                    data: Some(()),
                    error: None,
                }),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }),
        ),
    }
}

/// App state shared with axum handlers
#[derive(Clone)]
struct AppState {
    app_handle: Option<tauri::AppHandle>,
}

// POST /api/session/:id/permission-request - Request permission for a tool
// This endpoint blocks until the user responds via the frontend
async fn permission_request_handler(
    State(state): State<Arc<AppState>>,
    Path(session_id): Path<String>,
    Json(mut request): Json<PermissionRequest>,
) -> (StatusCode, Json<ApiResponse<PermissionResponse>>) {
    // Ensure session_id in path matches request
    request.session_id = session_id.clone();

    // Check if tool is always-allowed for this session
    if permissions::is_always_allowed(&session_id, &request.tool_name) {
        println!(
            "[Server] Tool {} auto-allowed for session {}",
            request.tool_name, session_id
        );
        return (
            StatusCode::OK,
            Json(ApiResponse {
                success: true,
                data: Some(PermissionResponse {
                    request_id: request.request_id.clone(),
                    behavior: PermissionBehavior::Allow,
                    message: None,
                    interrupt: None,
                    always_allow: Some(true),
                }),
                error: None,
            }),
        );
    }

    println!(
        "[Server] Permission request for tool {} in session {}",
        request.tool_name, session_id
    );

    // Create oneshot channel for response
    let (tx, rx) = oneshot::channel::<PermissionResponse>();

    let request_id = request.request_id.clone();

    // Emit event to frontend
    if let Some(app_handle) = &state.app_handle {
        if let Err(e) = app_handle.emit("permission-request", &request) {
            println!("[Server] Failed to emit permission-request event: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some(format!("Failed to emit event: {}", e)),
                }),
            );
        }
    } else {
        println!("[Server] No app handle available to emit events");
        // In development/testing, auto-allow if no UI available
        return (
            StatusCode::OK,
            Json(ApiResponse {
                success: true,
                data: Some(PermissionResponse {
                    request_id,
                    behavior: PermissionBehavior::Allow,
                    message: None,
                    interrupt: None,
                    always_allow: None,
                }),
                error: None,
            }),
        );
    }

    // Store pending request
    permissions::add_pending(
        request_id.clone(),
        PendingPermission {
            request,
            response_tx: tx,
        },
    );

    // Wait for response with timeout (5 minutes)
    let timeout_duration = Duration::from_secs(300);
    match tokio::time::timeout(timeout_duration, rx).await {
        Ok(Ok(response)) => {
            // If always_allow is set, remember it
            if response.always_allow == Some(true) && response.behavior == PermissionBehavior::Allow
            {
                // Get the tool name from the request we just processed
                // We need to look it up before it's removed
                let tool_name = {
                    let pending = permissions::PENDING_PERMISSIONS.lock().unwrap();
                    pending
                        .get(&request_id)
                        .map(|p| p.request.tool_name.clone())
                };
                if let Some(tool_name) = tool_name {
                    permissions::set_always_allowed(&session_id, &tool_name);
                    println!(
                        "[Server] Tool {} now always-allowed for session {}",
                        tool_name, session_id
                    );
                }
            }

            println!(
                "[Server] Permission response for {}: {:?}",
                request_id, response.behavior
            );
            (
                StatusCode::OK,
                Json(ApiResponse {
                    success: true,
                    data: Some(response),
                    error: None,
                }),
            )
        }
        Ok(Err(_)) => {
            // Channel closed (request was cancelled)
            permissions::take_pending(&request_id);
            (
                StatusCode::GONE,
                Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some("Permission request was cancelled".to_string()),
                }),
            )
        }
        Err(_) => {
            // Timeout
            permissions::take_pending(&request_id);
            println!("[Server] Permission request {} timed out", request_id);
            (
                StatusCode::REQUEST_TIMEOUT,
                Json(ApiResponse {
                    success: false,
                    data: None,
                    error: Some("Permission request timed out".to_string()),
                }),
            )
        }
    }
}

pub async fn start_server_with_app(app_handle: tauri::AppHandle) {
    start_server_internal(Some(app_handle)).await;
}

pub async fn start_server() {
    start_server_internal(None).await;
}

async fn start_server_internal(app_handle: Option<tauri::AppHandle>) {
    // Build router with CORS enabled for local development
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = Arc::new(AppState { app_handle });

    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/session/:id", get(get_session))
        .route("/api/session/:id/status", post(update_status))
        .route("/api/session/:id/message", post(send_message))
        .route("/api/session/:id/comments", get(get_comments))
        .route(
            "/api/session/:id/comments/:comment_id/reply",
            post(reply_to_comment_handler),
        )
        .route(
            "/api/session/:id/comments/:comment_id/resolve",
            post(resolve_comment_handler),
        )
        .route(
            "/api/session/:id/permission-request",
            post(permission_request_handler),
        )
        .with_state(state)
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], SERVER_PORT));
    println!("[Server] Starting HTTP server on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
