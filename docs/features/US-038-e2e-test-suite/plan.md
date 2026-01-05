# E2E Test Suite Plan

## Overview

Create comprehensive E2E tests for all features to prevent regressions. Tests will use Tauri MCP tools for UI automation and SQLite queries for state verification.

## Test Infrastructure

### Location
- `docs/features/US-038-e2e-test-suite/` - Feature folder
- `e2e/` - Test runner and utilities

### Test Runner Approach
Create a simple test runner that can be executed via Tauri MCP tools:
1. Connect to running Tauri app via `tauri_driver_session`
2. Execute test steps using `tauri_webview_*` tools
3. Verify state via SQLite queries and screenshots
4. Report pass/fail for each test

### Test Utilities (`e2e/utils.ts`)
```typescript
// Database helpers
export const queryDb = (sql: string) => // sqlite3 wrapper
export const getSession = (id: string) => // get session from DB

// UI helpers  
export const waitForElement = (selector: string) => // wait for element
export const clickElement = (selector: string) => // click with retry
export const typeIntoInput = (selector: string, text: string) => // type text

// Claude interaction helpers
export const sendMessage = (sessionId: string, message: string) => // send via InputArea
export const waitForResponse = () => // wait for Claude to respond
export const waitForPermissionDialog = () => // wait for permission prompt
```

---

## Test Suites

### 1. Session Management (`e2e/sessions.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Create new session | Click "+", fill name, select workspace, submit | Session appears in sidebar, DB has new row |
| Rename session | Double-click session name, type new name, Enter | Name updates in sidebar and DB |
| Delete session | Right-click session, click delete, confirm | Session removed from sidebar and DB |
| Switch sessions | Click different session in sidebar | Main panel shows selected session |
| Session persists on reload | Create session, reload app | Session still visible and functional |

### 2. Headless Chat (`e2e/chat.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Send message | Type in InputArea, press Enter | User message appears, Claude responds |
| Message markdown | Send "explain **bold** and *italic*" | Bold/italic rendered correctly |
| Code blocks | Send "show me a hello world in python" | Code block with syntax highlighting |
| Multi-turn context | Ask question, ask follow-up | Claude remembers previous context |
| Session resume | Leave session, return | Can continue conversation |

### 3. Tool Call Display (`e2e/tools.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Read tool | Ask "read package.json" | ToolCall shows file path and content |
| Write tool | Ask "create test.txt with hello" | ToolCall shows file creation, file exists |
| Edit tool | Ask "add comment to file" | ToolCall shows diff (red/green) |
| Bash tool | Ask "run ls" | ToolCall shows command and output |
| Glob tool | Ask "find all .ts files" | ToolCall shows pattern and results |
| Grep tool | Ask "search for useState" | ToolCall shows matches |

### 4. Permission System (`e2e/permissions.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Dialog appears | Trigger Write tool in normal mode | Permission dialog visible |
| Deny (Esc) | Press Esc on dialog | Tool rejected, Claude informed |
| Allow once (Enter) | Press Enter on dialog | Tool executes, dialog appears again next time |
| Always allow edits (Cmd+Enter) | Press Cmd+Enter for Write tool | Mode switches to acceptEdits |
| Always allow project (Cmd+Enter) | Press Cmd+Enter for Bash tool | Tool added to allowed list |
| Keyboard shortcuts work | Test Esc, Enter, Cmd+Enter | All shortcuts functional |
| 5-minute timeout | Wait without responding | Dialog dismissed, tool rejected |

### 5. Diff Viewer (`e2e/diff.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Base commit captured | Open diff panel first time | base_commit set in DB |
| Shows all changes | Create file, open diff | File appears in diff list |
| File watcher updates | Create file while diff open | Diff updates within 1s |
| Expand file diff | Click file in list | Hunks shown with +/- lines |
| Diff header shows SHA | Open diff panel | Short SHA displayed |
| Untracked files shown | Create new untracked file | Appears in diff |

### 6. Sidebar (`e2e/sidebar.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Workspaces listed | Open app | Workspaces from DB shown |
| Sessions under workspace | Expand workspace | Sessions listed underneath |
| Busy spinner | Claude processing | Spinner shows on session |
| Spinner stops | Claude finishes | Spinner disappears |
| Inbox indicator | Have unread message | Badge shows count |
| New workspace | Click add workspace | Modal opens, can create |

### 7. Settings & Modes (`e2e/settings.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Permission mode cycle | Toggle permission mode | Cycles through ask/acceptEdits/bypass |
| Thinking toggle | Toggle thinking setting | Thinking blocks show/hide |
| Todo toggle | Toggle todo setting | Todo list shows/hide |
| Verbose toggle | Toggle verbose | More/less detail in output |
| Settings persist | Change setting, reload | Setting retained |

### 8. Inbox & Comments (`e2e/inbox.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| notify_ready appears | Claude calls notify_ready | Message in inbox |
| Inbox badge updates | New message arrives | Badge count increases |
| View inbox | Click inbox icon | Inbox view opens |
| Mark as read | View message | Badge count decreases |

### 9. Error Handling (`e2e/errors.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Invalid prompt handled | Send empty message | Graceful error, no crash |
| Network error recovery | Disconnect/reconnect | App recovers |
| Sidecar crash recovery | Kill agent-service | Error shown, can restart |

### 10. Integration (`e2e/integration.test.ts`)

| Test | Steps | Verification |
|------|-------|--------------|
| Full workflow | Create session, chat, edit file, view diff, approve permission | All steps work together |
| Session lifecycle | Create → Use → Close → Resume | Full lifecycle works |
| Multiple sessions | Create 3 sessions, switch between | All maintain state |

---

## Implementation Steps

1. **Create feature folder**: `docs/features/US-038-e2e-test-suite/`
2. **Create stories.json**: Document all tests
3. **Create e2e/ folder structure**:
   ```
   e2e/
   ├── utils.ts           # Test utilities
   ├── runner.ts          # Test runner
   ├── sessions.test.ts   # Session tests
   ├── chat.test.ts       # Chat tests
   ├── tools.test.ts      # Tool display tests
   ├── permissions.test.ts# Permission tests
   ├── diff.test.ts       # Diff viewer tests
   ├── sidebar.test.ts    # Sidebar tests
   ├── settings.test.ts   # Settings tests
   ├── inbox.test.ts      # Inbox tests
   ├── errors.test.ts     # Error handling tests
   └── integration.test.ts# Integration tests
   ```
4. **Add data-testid attributes**: Add to components for reliable selection
5. **Implement test utilities**: Database queries, UI helpers
6. **Implement each test suite**: One at a time, verify working
7. **Create run script**: Easy way to execute all tests

---

## Key Files to Modify

- `src/components/*.tsx` - Add `data-testid` attributes
- `package.json` - Add test scripts if needed

## New Files to Create

- `docs/features/US-038-e2e-test-suite/stories.json`
- `docs/features/US-038-e2e-test-suite/plan.md`
- `e2e/utils.ts`
- `e2e/runner.ts`
- `e2e/*.test.ts` (10 test files)

---

## Test Execution Method

Tests will be executed manually via Tauri MCP tools in Claude Code:
1. Start the app: `npm run tauri dev`
2. Connect: `tauri_driver_session start`
3. Run tests by reading test file and executing steps
4. Verify with screenshots and DB queries

This approach works well because:
- We already use Tauri MCP for testing during development
- No additional test framework dependencies needed
- Tests document the expected behavior clearly
- Can be run incrementally during development

---

## Test Count Summary

| Suite | Tests |
|-------|-------|
| Sessions | 5 |
| Chat | 5 |
| Tools | 6 |
| Permissions | 7 |
| Diff Viewer | 6 |
| Sidebar | 6 |
| Settings | 5 |
| Inbox | 4 |
| Errors | 3 |
| Integration | 3 |
| **Total** | **50** |
