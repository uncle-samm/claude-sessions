# US-036: Tool Permission System - Implementation Plan

## Overview

Implement a permission dialog that intercepts Claude's tool calls requiring user approval.

## Architecture

```
Agent Service → HTTP POST → Tauri Backend → Tauri Event → React Dialog
                                                ↓
Agent Service ← HTTP Response ← Tauri Backend ← Invoke ← User Action
```

## Implementation Order

### Step 1: Tauri Backend (Rust)

Add to `src-tauri/src/lib.rs`:
- `PendingPermission` struct with oneshot channel sender
- `PENDING_PERMISSIONS: Arc<Mutex<HashMap<String, PendingPermission>>>`

Add to `src-tauri/src/server.rs`:
- `POST /api/session/{id}/permission-request` - Receives request, emits event, waits for response
- Handler stores request in PENDING_PERMISSIONS map and waits on receiver

Add Tauri command:
- `respond_to_permission(request_id, response)` - Called by frontend, sends to channel

### Step 2: React Component

Create `src/components/PermissionDialog.tsx`:
- Listen for `permission-request` Tauri event
- Display modal with tool info
- Handle button clicks and keyboard shortcuts
- Call `respond_to_permission` Tauri command

### Step 3: Agent Service

Update `scripts/agent-service/src/index.ts`:
- Add `canUseTool` callback to SDK options
- POST to `/api/session/{id}/permission-request`
- Wait for response
- Return `PermissionResult`

## Key Types

```typescript
// Permission request from agent to Tauri
interface PermissionRequest {
  request_id: string;
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  suggestions?: PermissionUpdate[];
}

// Permission response from frontend to Tauri
interface PermissionResponse {
  request_id: string;
  behavior: 'allow' | 'deny';
  message?: string;  // For deny
  updated_permissions?: PermissionUpdate[];  // For always-allow
}
```

## Keyboard Shortcuts

- `Escape` → Deny
- `Enter` → Allow once
- `Cmd/Ctrl + Enter` → Always allow for project
