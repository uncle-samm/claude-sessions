# US-035: SDK Custom Tools Testing

## Date: 2026-01-05

## Summary

Successfully tested the SDK custom tools implementation that replaces the old MCP bridge approach.

## Test Results

### 1. Agent Service Sidecar
- **Status**: Working
- The agent-service binary starts correctly when invoked from Tauri
- Connects to Claude API using claude-opus-4-5-20251101 model
- Session resume functionality works

### 2. Custom Tools Available
The following tools are now provided via the SDK MCP server:
- `mcp__claude-sessions__notify_ready` - Sends messages to inbox
- `mcp__claude-sessions__notify_busy` - Notifies busy status
- `mcp__claude-sessions__get_pending_comments` - Retrieves open comments
- `mcp__claude-sessions__reply_to_comment` - Replies to comments
- `mcp__claude-sessions__resolve_comment` - Resolves comments
- `mcp__claude-sessions__request_review` - Requests code review

### 3. notify_ready Tool
- **Tested**: Yes
- **Result**: Working
- Messages appear in inbox with correct session association
- Timestamp: 2026-01-05T13:52:00
- Example message: "Acknowledged test message and cleared stale todo list."

### 4. get_pending_comments Tool
- **Tested**: Yes
- **Result**: Working
- Returns "No pending comments" when no open root-level comments exist
- Correctly queries HTTP API at http://127.0.0.1:19420/api/session/{id}/comments

### 5. configure_worktree() Changes
- **Status**: Verified
- No longer creates `.mcp.json` in worktrees
- No longer creates `.claude/settings.local.json` in worktrees
- Function now just logs: `[Config] Worktree configured at: {path} (no MCP files needed)`

### 6. mcp-bridge.cjs
- **Status**: Deleted
- File no longer exists at `scripts/mcp-bridge.cjs`

## Architecture Changes

### Before (Old Approach)
1. configure_worktree() created `.mcp.json` and `.claude/settings.local.json`
2. Claude CLI read these files to configure MCP servers
3. mcp-bridge.cjs handled MCP protocol communication

### After (New Approach)
1. agent-service uses SDK's `createSdkMcpServer()` to create custom tools
2. Tools communicate directly with Tauri HTTP API
3. claudeSessionsId is passed to agent-service, which injects it into tool handlers
4. No filesystem configuration needed

## Files Modified

- `scripts/agent-service/src/index.ts` - Custom tools implementation
- `scripts/agent-service/package.json` - Dependencies
- `src-tauri/src/claude_headless.rs` - Passes claudeSessionsId to sidecar
- `src-tauri/src/lib.rs` - Simplified configure_worktree()
- `scripts/mcp-bridge.cjs` - Deleted

## Commit Hash
Run `git rev-parse HEAD` after committing.
