# E2E Test Checklist

This document provides step-by-step instructions for running E2E tests using Tauri MCP tools.

## Prerequisites

1. Start the app: `npm run tauri dev`
2. Connect via MCP: `tauri_driver_session start`

## Database Path
```
~/Library/Application Support/com.samb.claude-sessions/sessions.db
```

---

## Test Suite 1: Session Management (5 tests)

### 1.1 Create New Session
```
Steps:
1. tauri_webview_find_element selector="[data-testid='add-session-btn']"
2. tauri_webview_interact action="click" selector="[data-testid='add-session-btn']"
3. tauri_webview_wait_for type="selector" value="[data-testid='new-session-input']"
4. tauri_webview_keyboard action="type" selector="[data-testid='new-session-input']" text="test-session"
5. tauri_webview_keyboard action="press" key="Enter"
6. tauri_webview_screenshot

Verify:
- Session appears in sidebar with name "test-session"
- sqlite3 DB: SELECT COUNT(*) FROM sessions WHERE name='test-session'
```

### 1.2 Rename Session
```
Steps:
1. tauri_webview_interact action="double-click" selector="[data-testid='session-name']"
2. tauri_webview_keyboard action="type" selector=".session-name-input" text="renamed-session"
3. tauri_webview_keyboard action="press" key="Enter"
4. tauri_webview_screenshot

Verify:
- Session name updated in sidebar
- sqlite3 DB: SELECT name FROM sessions WHERE id='<session_id>'
```

### 1.3 Switch Sessions
```
Steps:
1. Create two sessions first
2. tauri_webview_interact action="click" selector="[data-testid='session-item']:nth-child(2)"
3. tauri_webview_screenshot

Verify:
- Second session is now active (has .active class)
- Chat content changes
```

### 1.4 Delete Session
```
Steps:
1. tauri_webview_interact action="click" selector="[data-testid='session-item'] .close-btn"
2. tauri_webview_screenshot

Verify:
- Session removed from sidebar
- sqlite3 DB: Session no longer exists
```

### 1.5 Session Persists on Reload
```
Steps:
1. Create a session
2. Note the session name
3. Reload the app (manual or via tauri command)
4. tauri_webview_find_element selector="[data-testid='session-item']"

Verify:
- Session still exists after reload
```

---

## Test Suite 2: Headless Chat (5 tests)

### 2.1 Send Message
```
Steps:
1. tauri_webview_wait_for type="selector" value="[data-testid='input-textarea']"
2. tauri_webview_keyboard action="type" selector="[data-testid='input-textarea']" text="Hello, say hi back briefly"
3. tauri_webview_keyboard action="press" key="Enter"
4. Wait 10 seconds for response
5. tauri_webview_screenshot

Verify:
- User message appears: [data-testid='user-message']
- Assistant message appears: [data-testid='assistant-message']
```

### 2.2 Message Markdown Rendering
```
Steps:
1. Send: "Explain what **bold** and *italic* mean in markdown"
2. Wait for response
3. tauri_webview_screenshot

Verify:
- Response contains <strong> and <em> elements
- Proper formatting visible
```

### 2.3 Code Blocks with Syntax Highlighting
```
Steps:
1. Send: "Show me a hello world in Python, just the code"
2. Wait for response
3. tauri_webview_find_element selector="[data-testid='code-block']"
4. tauri_webview_screenshot

Verify:
- Code block exists
- Has syntax highlighting classes (hljs)
```

### 2.4 Multi-turn Context
```
Steps:
1. Send: "My favorite color is blue. Remember that."
2. Wait for response
3. Send: "What is my favorite color?"
4. Wait for response
5. tauri_webview_screenshot

Verify:
- Response mentions "blue"
- Context maintained across turns
```

### 2.5 Session Resume
```
Steps:
1. Have a conversation in session A
2. Switch to session B
3. Switch back to session A
4. tauri_webview_screenshot

Verify:
- Previous messages visible
- Can continue conversation
```

---

## Test Suite 3: Tool Call Display (6 tests)

### 3.1 Read Tool
```
Steps:
1. Send: "Read package.json and tell me the app name"
2. Wait for response
3. tauri_webview_find_element selector="[data-testid='tool-call-read']"
4. tauri_webview_screenshot

Verify:
- Read tool card visible
- Shows file path
- Shows file content (expandable)
```

### 3.2 Write Tool
```
Steps:
1. Send: "Create a file called e2e-test.txt with 'hello world' in it"
2. Handle permission dialog if in normal mode
3. Wait for response
4. tauri_webview_find_element selector="[data-testid='tool-call-write']"
5. tauri_webview_screenshot

Verify:
- Write tool card visible
- File actually created on disk
```

### 3.3 Edit Tool
```
Steps:
1. Send: "Add a comment to the top of e2e-test.txt"
2. Handle permission dialog
3. Wait for response
4. tauri_webview_find_element selector="[data-testid='tool-call-edit']"
5. tauri_webview_screenshot

Verify:
- Edit tool card visible
- Shows before/after diff
- Red for removed, green for added
```

### 3.4 Bash Tool
```
Steps:
1. Send: "Run: echo 'test output'"
2. Handle permission dialog
3. Wait for response
4. tauri_webview_find_element selector="[data-testid='tool-call-bash']"
5. tauri_webview_screenshot

Verify:
- Bash tool card visible
- Shows command
- Shows output
```

### 3.5 Glob Tool
```
Steps:
1. Send: "Find all .tsx files in src/components"
2. Wait for response
3. tauri_webview_find_element selector="[data-testid='tool-call-glob']"
4. tauri_webview_screenshot

Verify:
- Glob tool card visible
- Shows pattern
- Lists matching files
```

### 3.6 Grep Tool
```
Steps:
1. Send: "Search for 'useState' in src/components"
2. Wait for response
3. tauri_webview_find_element selector="[data-testid='tool-call-grep']"
4. tauri_webview_screenshot

Verify:
- Grep tool card visible
- Shows search pattern
- Shows matching lines
```

---

## Test Suite 4: Permission System (7 tests)

### 4.1 Permission Dialog Appears
```
Steps:
1. Ensure permission mode is 'normal' (not acceptEdits)
2. Send: "Create a file called permission-test.txt with 'hello'"
3. tauri_webview_wait_for type="selector" value="[data-testid='permission-dialog']" timeout=15000
4. tauri_webview_screenshot

Verify:
- Permission dialog visible
- Shows tool name
- Shows command preview
- Has Deny, Always allow, Allow once buttons
```

### 4.2 Deny (Esc)
```
Steps:
1. Trigger permission dialog
2. tauri_webview_keyboard action="press" key="Escape"
3. Wait 1 second
4. tauri_webview_screenshot

Verify:
- Dialog closed
- Tool was rejected
- Claude informed of denial
```

### 4.3 Allow Once (Enter)
```
Steps:
1. Trigger permission dialog
2. tauri_webview_keyboard action="press" key="Enter"
3. Wait for tool execution
4. tauri_webview_screenshot

Verify:
- Dialog closed
- Tool executed
- Same tool triggers dialog again next time
```

### 4.4 Always Allow Edits (Cmd+Enter for Write)
```
Steps:
1. Trigger permission dialog for Write tool
2. tauri_webview_keyboard action="press" key="Enter" modifiers=["Meta"]
3. Wait
4. tauri_webview_execute_js script="localStorage.getItem('permission-mode')"
5. tauri_webview_screenshot

Verify:
- Dialog closed
- Permission mode switched to 'acceptEdits'
```

### 4.5 Always Allow for Project (Cmd+Enter for Bash)
```
Steps:
1. Reset to normal mode first
2. Trigger permission dialog for Bash tool
3. tauri_webview_keyboard action="press" key="Enter" modifiers=["Meta"]
4. Wait
5. Trigger same Bash command again
6. tauri_webview_screenshot

Verify:
- No dialog appears second time
- Tool added to allowed list
```

### 4.6 Keyboard Shortcuts Work
```
Steps:
1. Test Esc → closes dialog, denies
2. Test Enter → closes dialog, allows once
3. Test Cmd+Enter → closes dialog, always allows

Verify:
- Each shortcut performs correct action
```

### 4.7 Timeout (5 minutes)
```
Note: This test takes 5 minutes - manual verification only
Steps:
1. Trigger permission dialog
2. Wait 5 minutes without responding

Verify:
- Dialog auto-dismissed
- Tool rejected
```

---

## Test Suite 5: Diff Viewer (6 tests)

### 5.1 Base Commit Captured
```
Steps:
1. Open a session
2. tauri_webview_interact action="click" selector="[data-testid='diff-toggle-btn']" (or equivalent)
3. tauri_webview_wait_for type="selector" value="[data-testid='diff-panel']"
4. tauri_webview_screenshot
5. sqlite3 DB: SELECT base_commit FROM sessions WHERE id='<session_id>'

Verify:
- Diff panel visible
- base_commit is now set in DB
- Header shows short SHA
```

### 5.2 Shows All Changes
```
Steps:
1. Create a file in the worktree
2. Open diff panel
3. tauri_webview_find_element selector="[data-testid='diff-file-item']"
4. tauri_webview_screenshot

Verify:
- New file appears in diff list
- Shows as added (+)
```

### 5.3 File Watcher Auto-Updates
```
Steps:
1. Open diff panel
2. Create a new file externally (touch test-watcher.txt)
3. Wait 1 second (debounce)
4. tauri_webview_screenshot

Verify:
- Diff panel updates automatically
- New file appears without manual refresh
```

### 5.4 Expand File Shows Hunks
```
Steps:
1. Open diff panel with changes
2. tauri_webview_interact action="click" selector="[data-testid='diff-file-item']:first-child"
3. tauri_webview_wait_for type="selector" value="[data-testid='diff-hunk']"
4. tauri_webview_screenshot

Verify:
- Diff hunks visible
- Added lines in green with +
- Removed lines in red with -
```

### 5.5 Diff Header Shows SHA
```
Steps:
1. Open diff panel
2. tauri_webview_find_element selector="[data-testid='diff-header']"
3. tauri_webview_screenshot

Verify:
- Header shows short SHA (7-8 chars)
- Matches base_commit in DB
```

### 5.6 Untracked Files Shown
```
Steps:
1. Create new untracked file (not git add)
2. Open diff panel
3. tauri_webview_screenshot

Verify:
- Untracked file appears in list
```

---

## Test Suite 6: Sidebar (6 tests)

### 6.1 Workspaces Listed
```
Steps:
1. tauri_webview_wait_for type="selector" value="[data-testid='workspace-list']"
2. tauri_webview_find_element selector="[data-testid='workspace-item']"
3. tauri_webview_screenshot

Verify:
- Workspace list exists
- Shows workspaces from DB
```

### 6.2 Sessions Under Workspace
```
Steps:
1. Expand a workspace (click on it)
2. tauri_webview_find_element selector="[data-testid='session-item']"
3. tauri_webview_screenshot

Verify:
- Sessions appear under workspace
```

### 6.3 Busy Spinner Shows
```
Steps:
1. Send a message to Claude
2. Immediately: tauri_webview_find_element selector="[data-testid='busy-spinner']"
3. tauri_webview_screenshot

Verify:
- Spinner visible while Claude processing
```

### 6.4 Spinner Stops When Done
```
Steps:
1. Wait for Claude to finish responding
2. tauri_webview_find_element selector="[data-testid='busy-spinner']" (should fail or not be visible)
3. tauri_webview_screenshot

Verify:
- Spinner no longer visible
```

### 6.5 Inbox Indicator
```
Steps:
1. Have unread inbox message (trigger notify_ready)
2. tauri_webview_find_element selector="[data-testid='inbox-badge']"
3. tauri_webview_screenshot

Verify:
- Badge shows unread count
```

### 6.6 New Workspace
```
Steps:
1. Click add workspace button
2. Wait for modal
3. tauri_webview_screenshot

Verify:
- Modal opens
- Can fill in details
```

---

## Test Suite 7: Settings (5 tests)

### 7.1 Permission Mode Cycling
```
Steps:
1. Find permission mode toggle
2. Click repeatedly
3. Check mode after each click via localStorage
4. tauri_webview_screenshot

Verify:
- Cycles: normal -> acceptEdits -> plan -> normal
```

### 7.2 Thinking Toggle
```
Steps:
1. Toggle thinking setting (Tab key)
2. Send message that triggers thinking
3. tauri_webview_screenshot

Verify:
- When on: thinking blocks shown
- When off: thinking blocks hidden
```

### 7.3 Todo Toggle
```
Steps:
1. Toggle todo setting (Ctrl+T)
2. tauri_webview_screenshot

Verify:
- Todo panel shows/hides
```

### 7.4 Verbose Toggle
```
Steps:
1. Toggle verbose mode (Ctrl+O)
2. tauri_webview_screenshot

Verify:
- More/less detail in tool outputs
```

### 7.5 Settings Persist
```
Steps:
1. Change a setting
2. Reload app
3. Check setting value

Verify:
- Setting retained after reload
```

---

## Test Suite 8: Inbox (4 tests)

### 8.1 notify_ready Appears
```
Steps:
1. Claude calls notify_ready MCP tool
2. tauri_webview_find_element selector="[data-testid='inbox-badge']"
3. tauri_webview_screenshot

Verify:
- Message appears in inbox
```

### 8.2 Inbox Badge Updates
```
Steps:
1. Receive new message
2. tauri_webview_find_element selector="[data-testid='inbox-badge']"
3. Note the count
4. tauri_webview_screenshot

Verify:
- Badge count accurate
```

### 8.3 View Inbox
```
Steps:
1. tauri_webview_interact action="click" selector="[data-testid='inbox-btn']"
2. tauri_webview_wait_for type="selector" value="[data-testid='inbox-view']"
3. tauri_webview_screenshot

Verify:
- Inbox view opens
- Messages displayed
```

### 8.4 Mark as Read
```
Steps:
1. View an unread message
2. Check badge count decreases
3. tauri_webview_screenshot

Verify:
- Badge count decreases
- Message marked as read
```

---

## Test Suite 9: Error Handling (3 tests)

### 9.1 Empty Message
```
Steps:
1. Clear input
2. Press Enter
3. tauri_webview_screenshot

Verify:
- No crash
- Graceful handling
```

### 9.2 Network Error Recovery
```
Note: Requires network simulation
Steps:
1. Disconnect network
2. Try to send message
3. Reconnect
4. tauri_webview_screenshot

Verify:
- App recovers
```

### 9.3 Sidecar Crash Recovery
```
Steps:
1. Kill agent-service process
2. tauri_webview_screenshot

Verify:
- Error shown to user
- Can restart session
```

---

## Test Suite 10: Integration (3 tests)

### 10.1 Full Workflow
```
Steps:
1. Create session
2. Send message
3. Claude edits a file
4. Approve permission
5. View diff panel
6. Verify changes shown
7. tauri_webview_screenshot

Verify:
- All steps complete successfully
- State consistent throughout
```

### 10.2 Session Lifecycle
```
Steps:
1. Create new session
2. Use session (send messages)
3. Switch away
4. Return to session
5. Close session
6. tauri_webview_screenshot

Verify:
- Full lifecycle works
- State preserved at each step
```

### 10.3 Multiple Concurrent Sessions
```
Steps:
1. Create 3 sessions
2. Use each one
3. Switch between them
4. tauri_webview_screenshot

Verify:
- All sessions maintain their state
- No cross-contamination
```

---

## Quick Validation

Run these commands to verify the app is testable:

```bash
# 1. Start app
npm run tauri dev

# 2. Connect
tauri_driver_session action="start"

# 3. Take screenshot
tauri_webview_screenshot

# 4. Find sidebar
tauri_webview_find_element selector="[data-testid='sidebar']"

# 5. Find message list
tauri_webview_find_element selector="[data-testid='message-list']"
```

---

## Data-testid Reference

| Component | Selector |
|-----------|----------|
| Sidebar | `[data-testid="sidebar"]` |
| Inbox button | `[data-testid="inbox-btn"]` |
| Inbox badge | `[data-testid="inbox-badge"]` |
| Workspace list | `[data-testid="workspace-list"]` |
| Workspace item | `[data-testid="workspace-item"]` |
| Session item | `[data-testid="session-item"]` |
| Session name | `[data-testid="session-name"]` |
| Add session btn | `[data-testid="add-session-btn"]` |
| Busy spinner | `[data-testid="busy-spinner"]` |
| Chat container | `[data-testid="chat-container"]` |
| Message list | `[data-testid="message-list"]` |
| User message | `[data-testid="user-message"]` |
| Assistant message | `[data-testid="assistant-message"]` |
| Input area | `[data-testid="input-area"]` |
| Input textarea | `[data-testid="input-textarea"]` |
| Send button | `[data-testid="send-btn"]` |
| Permission dialog | `[data-testid="permission-dialog"]` |
| Permission deny | `[data-testid="permission-deny-btn"]` |
| Permission allow | `[data-testid="permission-allow-btn"]` |
| Permission always | `[data-testid="permission-always-btn"]` |
| Diff panel | `[data-testid="diff-panel"]` |
| Diff header | `[data-testid="diff-header"]` |
| Diff file list | `[data-testid="diff-file-list"]` |
| Diff file item | `[data-testid="diff-file-item"]` |
| Diff hunk | `[data-testid="diff-hunk"]` |
| Tool call read | `[data-testid="tool-call-read"]` |
| Tool call write | `[data-testid="tool-call-write"]` |
| Tool call edit | `[data-testid="tool-call-edit"]` |
| Tool call bash | `[data-testid="tool-call-bash"]` |
| Tool call glob | `[data-testid="tool-call-glob"]` |
| Tool call grep | `[data-testid="tool-call-grep"]` |
| Inbox view | `[data-testid="inbox-view"]` |
| Inbox message | `[data-testid="inbox-message"]` |
