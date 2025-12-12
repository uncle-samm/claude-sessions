# Claude Sessions - Agent Manager

## Quick Reference
- **Plan:** `.claude/plans/peppy-foraging-lobster.md`
- **User Stories:** `userstories.json` (requirements + test steps)
- **Design Reference:** `design-reference.png`
- **Notes:** `notes/` - coding diary with fixes, learnings, progress

## Development Standards

### Planning
- Every feature needs a user story in `userstories.json` with:
  - Clear requirements
  - E2E test steps (MCP interaction + UI verification)
  - Acceptance criteria
- Update plan file when scope changes

### Testing (No Shortcuts)
1. **Database verification:** Query SQLite directly to verify data
2. **MCP E2E tests:** Use actual MCP tools via the bridge (not just HTTP)
3. **UI verification:** Screenshot + visual check against design
4. **Real Claude interaction:** Test MCP tools with Claude in terminal using `window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].writeLine()`

### Documentation
- Create note in `notes/YYYY-MM-DD-topic.md` for each session
- Include: what was built, fixes made, learnings
- **Before implementing:** Search `notes/` with Grep for related issues/fixes to avoid regressions

### Git Discipline
- Commit frequently with clear messages
- Push regularly to preserve history
- Use `git log` to reference previous states if things break

## Architecture

### MCP Tools (port 19420)
| Tool | Purpose |
|------|---------|
| `notify_ready(message)` | Send completion message to inbox |
| `notify_busy()` | Signal working status |
| `get_pending_comments()` | Get open comments on diff |
| `reply_to_comment(id, msg)` | Reply to comment thread |
| `resolve_comment(id, note?)` | Mark comment resolved |

### Key Files
- `src/components/Terminal.tsx` - xterm.js + PTY
- `src/components/DiffViewer.tsx` - Diff panel with comments
- `src-tauri/src/server.rs` - HTTP API (port 19420)
- `scripts/mcp-bridge.cjs` - MCP tool handlers

### Terminal Debug API
```javascript
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].writeLine('message')
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].write('\r') // Enter
window.__CLAUDE_SESSIONS_TERMINALS__[sessionId].getBuffer() // Read output
```

## Screenshot Fix (Required)
Use AppleScript before screenshots - macOS blocks programmatic focus:
```applescript
tell application "System Events"
    tell process "claude-sessions"
        set frontmost to true
    end tell
end tell
```
**Only this command allowed.** No other AppleScript use.

## Database
Location: `~/Library/Application Support/com.samb.claude-sessions/sessions.db`

Key tables: `sessions`, `workspaces`, `inbox_messages`, `diff_comments`
