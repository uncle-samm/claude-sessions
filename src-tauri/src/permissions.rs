use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::oneshot;

/// A pending permission request waiting for user response
pub struct PendingPermission {
    pub request: PermissionRequest,
    pub response_tx: oneshot::Sender<PermissionResponse>,
}

/// Permission request sent from agent-service to Tauri
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub request_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub tool_input: serde_json::Value,
    pub tool_use_id: String,
    /// Human-readable description of the action
    pub description: Option<String>,
}

/// Permission response from frontend back to agent-service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub request_id: String,
    pub behavior: PermissionBehavior,
    /// Message explaining denial (for deny behavior)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// Whether to interrupt execution (for deny behavior)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interrupt: Option<bool>,
    /// Whether this should be remembered for the session (for allow behavior)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub always_allow: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PermissionBehavior {
    Allow,
    Deny,
}

/// Global map of pending permission requests
pub static PENDING_PERMISSIONS: Lazy<Mutex<HashMap<String, PendingPermission>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Tools that have been always-allowed for a session
/// Key: (session_id, tool_pattern), Value: true
pub static ALWAYS_ALLOWED: Lazy<Mutex<HashMap<(String, String), bool>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Check if a tool is always-allowed for a session
pub fn is_always_allowed(session_id: &str, tool_name: &str) -> bool {
    let allowed = ALWAYS_ALLOWED.lock().unwrap();
    // Check exact match first
    if allowed.contains_key(&(session_id.to_string(), tool_name.to_string())) {
        return true;
    }
    // Could add pattern matching here in the future
    false
}

/// Mark a tool as always-allowed for a session
pub fn set_always_allowed(session_id: &str, tool_name: &str) {
    let mut allowed = ALWAYS_ALLOWED.lock().unwrap();
    allowed.insert((session_id.to_string(), tool_name.to_string()), true);
}

/// Add a pending permission request
pub fn add_pending(request_id: String, pending: PendingPermission) {
    let mut pending_map = PENDING_PERMISSIONS.lock().unwrap();
    pending_map.insert(request_id, pending);
}

/// Remove and return a pending permission request
pub fn take_pending(request_id: &str) -> Option<PendingPermission> {
    let mut pending_map = PENDING_PERMISSIONS.lock().unwrap();
    pending_map.remove(request_id)
}

/// Get a list of all pending request IDs for a session
pub fn get_pending_for_session(session_id: &str) -> Vec<String> {
    let pending_map = PENDING_PERMISSIONS.lock().unwrap();
    pending_map
        .iter()
        .filter(|(_, p)| p.request.session_id == session_id)
        .map(|(id, _)| id.clone())
        .collect()
}
