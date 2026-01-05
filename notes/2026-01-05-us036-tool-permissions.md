# US-036: Tool Permission System

## What Was Built

Implemented a permission dialog UI that intercepts Claude's tool calls requiring user approval. The system allows users to:
- **Deny** a tool call (Esc key)
- **Allow once** (Enter key)
- **Always allow for project** (Cmd+Enter) - persists for the session

## Architecture

```
Agent Service → HTTP POST → Tauri Backend → Tauri Event → React Dialog
                                                ↓
Agent Service ← HTTP Response ← Tauri Backend ← Invoke ← User Action
```

## Key Files

### Rust Backend
- `src-tauri/src/permissions.rs` - Permission types and state management
  - `PendingPermission` struct with oneshot channel
  - `PENDING_PERMISSIONS` map for tracking requests
  - `ALWAYS_ALLOWED` map for session-persistent permissions

- `src-tauri/src/server.rs` - HTTP endpoints
  - `POST /api/session/{id}/permission-request` - Blocks until user responds
  - Uses Tauri events to notify frontend
  - 5-minute timeout on requests

- `src-tauri/src/lib.rs` - Tauri command
  - `respond_to_permission` - Called by frontend to respond to requests

### React Frontend
- `src/components/PermissionDialog.tsx` - Modal dialog component
  - Listens for `permission-request` Tauri events
  - Shows tool name, description, and input preview
  - Keyboard shortcuts: Esc (deny), Enter (allow), Cmd+Enter (always allow)

- `src/components/PermissionDialog.css` - Dark theme styling

### Agent Service
- `scripts/agent-service/src/index.ts`
  - `createCanUseTool()` callback function
  - Auto-allows safe tools (Read, Glob, Grep, TodoWrite, etc.)
  - POSTs to Tauri backend for dangerous tools (Bash, Write, Edit)
  - Returns `PermissionResult` based on user response

## Safe Tools (Auto-allowed)
- Read, Glob, Grep, TodoWrite, WebSearch, Task
- All custom MCP tools (mcp__claude-sessions__*)

## Testing

Tested via Tauri event emission:
```javascript
window.__TAURI__.event.emit('permission-request', {
  request_id: 'test-123',
  session_id: 'test-session',
  tool_name: 'Bash',
  tool_input: { command: 'rm -rf /important/files' },
  tool_use_id: 'tool-456'
});
```

UI correctly shows:
- "Allow Claude to **Run**?" for Bash
- "Allow Claude to **Write to**?" for Write
- Command/file path preview
- All three action buttons

## Commit

To be committed after app restart verification.
