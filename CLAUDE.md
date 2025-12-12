# Claude Sessions - Agent Manager

## CRITICAL: Feature Development Workflow

**STOP! Before writing ANY code for a new feature:**
1. Find next US-XXX ID in `userstories.json`
2. Create `docs/features/US-XXX-feature-name/` folder
3. Create `story.json` with requirements (see format below)
4. Create `plan.md` with implementation steps
5. THEN start coding

**DO NOT skip these steps. This is mandatory for every feature.**

---

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

### 3. Testing (MANDATORY - NO LAZINESS ALLOWED)

**CRITICAL: You MUST actually execute tests, not just claim they work.**

Bad: "The button is visible so it's functional" - THIS IS LAZY
Good: Click the button, verify the action happened, check the database changed

**For EVERY feature, you must:**
1. **Actually click buttons** - Don't just verify they exist
2. **Verify side effects** - Check DB changed, API was called, state updated
3. **Test error cases** - What happens when things fail?
4. **Before/after verification** - Query state before, perform action, query after

**Test Tools:**
```javascript
// Interact with Claude in terminal
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].writeLine('message')
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].write('\r') // Submit
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].getBuffer() // Read output
```

**Test checklist (ALL required):**
1. Database BEFORE action: `sqlite3 "~/Library/...sessions.db" "SELECT ..."`
2. Perform the action via Tauri MCP tools (click, type, etc.)
3. Database AFTER action: Verify the change happened
4. UI verification: Screenshot showing the result
5. If async: Wait and re-check until complete

**Example - Testing a "Sync" button:**
```
1. Query DB: SELECT base_commit FROM sessions (note the value)
2. Click the Sync button via tauri_webview_interact
3. Wait for operation to complete
4. Query DB again: SELECT base_commit FROM sessions
5. VERIFY: The value changed to a new SHA
6. Screenshot: Show the UI updated
```

**DO NOT mark tests as "done" unless you actually ran them and verified the results.**

**Tip: Add `data-testid` attributes to components for easier test targeting:**
```tsx
<button data-testid="sync-btn" className="sync-btn">Sync</button>
```
Then select with: `[data-testid="sync-btn"]`

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
