# Claude Sessions - Agent Manager

# ⛔ STOP - READ THIS FIRST

## Before Writing ANY Code for a Feature OR Bug Fix:

```
1. List docs/features/ to find next US-XXX number
2. Create folder: docs/features/US-XXX-feature-name/
3. Create stories.json in that folder
4. Create plan.md in that folder (copy from .claude/plans/ if exists)
5. ONLY THEN start coding
```

**If you start coding without completing steps 1-4, STOP IMMEDIATELY and do them first.**

This applies to BOTH new features AND bug fixes.

**Even in Plan Mode:** When in plan mode, indicate that the first step of implementation will be to follow this workflow (create stories.json, etc.) before any code changes.

---

## Project Structure

```
claude-sessions/
├── docs/
│   └── features/           # One folder per feature/bug fix
│       └── US-XXX-name/
│           ├── stories.json  # Requirements with checkable items
│           └── plan.md       # Implementation plan
├── notes/                   # Coding diary
│   └── YYYY-MM-DD-topic.md # Daily notes with commit hashes
├── design-reference.png    # UI reference image
└── .claude/plans/          # Active plan file (temporary during planning)
```

## Feature Development Workflow

### 1. Before Starting Any Feature or Bug Fix
1. List `docs/features/` to find the next US-XXX number
2. Create folder: `docs/features/US-XXX-feature-name/`
3. Create `stories.json` with:
   - Requirements as checkable items: `{"item": "...", "done": false}`
   - E2E tests with clear steps
   - Acceptance criteria
4. Create `plan.md` with implementation steps
5. Search `notes/` for related fixes to avoid regressions

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

## stories.json Format

```json
{
  "id": "US-XXX",
  "title": "Feature Name or Fix: Bug Description",
  "type": "feature|bug_fix",
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

## ⚠️ DANGER: Kill Commands

**NEVER run `pkill claude-sessions` or similar kill commands targeting "claude-sessions".**

This will kill your own Claude Code process since it runs within the claude-sessions app. Instead:
- Use `lsof -i :PORT` to find specific PIDs
- Kill by PID: `kill <specific-pid>`
- Or ask the user to restart the app manually

---

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

---

## Automated Tests - RUN AFTER EVERY FEATURE/FIX

**MANDATORY: Run tests at the end of every feature or bug fix. Do not skip this step.**

### Test Commands
| Command | Description | Tests |
|---------|-------------|-------|
| `npm run test:run` | Unit tests (stores, components) | ~56 |
| `npm run test:e2e` | Core E2E via MCP Bridge | 9 |
| `npx vitest run --config e2e/vitest.config.ts e2e/specs/*.spec.ts` | Full E2E spec suite | 182 |
| `docker compose -f docker-compose.e2e.yml up` | Docker WebDriver tests | 15 |

### When to Run Tests
- **After completing any code changes** - Before committing
- **After refactoring** - Even "safe" refactors can break things
- **Before marking a feature as done** - All 206 tests must pass
- **When debugging** - Run tests to verify fixes don't break other things

### Test Structure
```
e2e/
├── helpers/
│   ├── bridge-client.ts      # WebSocket client for MCP Bridge
│   ├── database.ts           # SQLite test helpers
│   └── test-utils.ts         # waitForElement, sleep, etc.
├── specs/                    # 182 comprehensive E2E tests
│   ├── sidebar.spec.ts
│   ├── session.spec.ts
│   ├── headless-chat.spec.ts
│   ├── permission-dialog.spec.ts
│   ├── diff-viewer.spec.ts
│   ├── comments.spec.ts
│   ├── inbox.spec.ts
│   ├── settings.spec.ts
│   ├── workspace.spec.ts
│   └── session-recovery.spec.ts
├── tauri-e2e.test.ts         # Core MCP Bridge tests (9 tests)
├── docker-e2e.test.ts        # Docker WebDriver tests (15 tests)
└── vitest.config.ts
```

### Quick Verification (Before Every Commit)
```bash
# Unit tests
npm run test:run

# E2E tests (requires app running on port 9223)
npm run test:e2e
npx vitest run --config e2e/vitest.config.ts e2e/specs/*.spec.ts

# Docker tests (for CI/cross-platform verification)
docker compose -f docker-compose.e2e.yml up
```

### Test Totals
- Unit tests: ~56
- E2E specs: 182
- Core E2E: 9
- Docker: 15
- **Total: 206+ tests**

**If any test fails, fix it before proceeding. Do not ignore failing tests.**
