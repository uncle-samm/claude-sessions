# Claude Sessions - Agent Manager

## Project Structure

```
claude-sessions/
├── docs/
│   └── features/           # One folder per feature
│       └── US-XXX-name/
│           ├── story.json  # User story with checkable requirements
│           └── plan.md     # Implementation plan
├── notes/                   # Coding diary
│   └── YYYY-MM-DD-topic.md # Daily notes with commit hashes
├── userstories.json        # All user stories (legacy, still used)
├── design-reference.png    # UI reference image
└── .claude/plans/          # Active plan file
```

## Feature Development Workflow

### 1. Before Starting Any Feature
1. Create folder: `docs/features/US-XXX-feature-name/`
2. Create `story.json` with:
   - Requirements as checkable items: `{"item": "...", "done": false}`
   - E2E tests with clear steps
   - Acceptance criteria
3. Create `plan.md` with implementation steps
4. Search `notes/` for related fixes to avoid regressions

### 2. During Implementation
- Update todo list frequently
- Commit after each logical step
- Mark requirements as `done: true` when completed

### 3. Testing (MANDATORY - No Shortcuts)
Every feature MUST be tested via Tauri MCP tools:

```javascript
// Use these to interact with Claude in terminal
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].writeLine('message')
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].write('\r') // Submit
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].getBuffer() // Read output
```

**Test checklist:**
1. Database: `sqlite3 "~/Library/Application Support/com.samb.claude-sessions/sessions.db"`
2. UI: Take screenshot with `mcp__tauri__tauri_webview_screenshot`
3. MCP: Test actual tool calls, not just HTTP endpoints
4. Claude interaction: Send commands to Claude via terminal API

### 4. After Completion
1. Mark all story items as `done: true`
2. Create note in `notes/YYYY-MM-DD-topic.md` with:
   - What was built
   - Fixes made (with file:line references)
   - Commit hash: `git rev-parse HEAD`
3. Commit and push

## Story.json Format

```json
{
  "id": "US-XXX",
  "title": "Feature Name",
  "status": "pending|in_progress|done",
  "requirements": [
    {"item": "Description", "done": false}
  ],
  "e2eTests": [
    {
      "name": "Test name",
      "steps": ["Step 1", "Step 2"],
      "done": false
    }
  ],
  "acceptanceCriteria": [
    {"item": "Criteria", "done": false}
  ],
  "files": ["file1.ts", "file2.rs"]
}
```

## Architecture

### MCP Tools (HTTP port 19420, WebSocket 9223)
| Tool | Purpose |
|------|---------|
| `notify_ready(message)` | Send completion message to inbox |
| `get_pending_comments()` | Get open comments on diff |
| `reply_to_comment(id, msg)` | Reply to comment thread |
| `resolve_comment(id, note?)` | Mark comment resolved |

### Key Files
- `src/components/Terminal.tsx` - xterm.js + PTY
- `src/components/DiffViewer.tsx` - Diff panel with comments
- `src-tauri/src/server.rs` - HTTP API
- `scripts/mcp-bridge.cjs` - MCP tool handlers

## Screenshot Fix (Required)
```applescript
tell application "System Events"
    tell process "claude-sessions"
        set frontmost to true
    end tell
end tell
```
**Only this command allowed.** No other AppleScript.

## Database
`~/Library/Application Support/com.samb.claude-sessions/sessions.db`

Tables: `sessions`, `workspaces`, `inbox_messages`, `diff_comments`
