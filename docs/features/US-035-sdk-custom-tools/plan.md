# US-035: Replace MCP Bridge with SDK Custom Tools

## Problem
Currently, the app uses an "MCP hack" to provide custom tools to Claude Code:
1. `scripts/mcp-bridge.cjs` - A Node.js MCP server that translates tool calls to HTTP requests
2. `configure_worktree()` in Rust - Creates `.mcp.json` and `.claude/settings.local.json` in each worktree
3. The MCP bridge runs as a separate process, communicating via HTTP to the Tauri server

Now that we use the Claude Agent SDK, we can define custom tools directly in TypeScript using `createSdkMcpServer()` and `tool()` helpers - eliminating the external process and file configuration.

## Current Architecture (to be replaced)

```
Claude Agent SDK (agent-service)
  ↓ spawns MCP server (reads .mcp.json)
scripts/mcp-bridge.cjs (separate Node.js process)
  ↓ HTTP requests
Tauri HTTP Server (port 19420)
  ↓
SQLite Database
```

**Files involved:**
- `scripts/mcp-bridge.cjs` - MCP server implementation
- `src-tauri/src/lib.rs:252-337` - `configure_worktree()` function
- `src-tauri/src/server.rs` - HTTP API endpoints

## New Architecture (SDK Custom Tools)

```
Claude Agent SDK (agent-service)
  ↓ in-process MCP server
Custom tools (defined in agent-service/src/index.ts)
  ↓ HTTP requests (same as before)
Tauri HTTP Server (port 19420)
  ↓
SQLite Database
```

**Benefits:**
- No separate MCP bridge process
- No `.mcp.json` / `.claude/settings.local.json` configuration files needed
- Simpler debugging (all in one process)
- Type-safe tool definitions with Zod schemas

## Implementation Plan

### Step 1: Add custom tools to agent-service
**File:** `scripts/agent-service/src/index.ts`

Add SDK custom tools using `createSdkMcpServer()`:

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const SESSION_SERVER_URL = process.env.CLAUDE_SESSIONS_SERVER || 'http://127.0.0.1:19420';

function createSessionTools(sessionId: string) {
  return createSdkMcpServer({
    name: "claude-sessions",
    version: "1.0.0",
    tools: [
      tool(
        "notify_ready",
        "IMPORTANT: Call this when you complete ANY task. Include a brief summary.",
        { message: z.string().describe("Brief summary of what was accomplished") },
        async (args) => {
          const response = await fetch(`${SESSION_SERVER_URL}/api/session/${sessionId}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: args.message })
          });
          const data = await response.json();
          return { content: [{ type: "text", text: data.success ? `Message sent: ${args.message}` : `Error: ${data.error}` }] };
        }
      ),
      // ... other tools: notify_busy, get_pending_comments, reply_to_comment, resolve_comment, request_review
    ]
  });
}
```

### Step 2: Pass custom tools to query() with streaming input
**File:** `scripts/agent-service/src/index.ts`

**Important:** SDK custom MCP tools require streaming input mode (async generator for prompt).

Update the `runAgent()` function:

```typescript
// Get session ID from input
const sessionId = input.sessionId;

// Build SDK options with custom tools
const options: Parameters<typeof query>[0]["options"] = {
  allowedTools: input.options?.allowedTools,
  permissionMode: input.options?.permissionMode,
  mcpServers: sessionId ? {
    "claude-sessions": createSessionTools(sessionId)
  } : undefined,
  // ... rest of options
};

// When using MCP servers, must use streaming input mode
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: input.prompt
    }
  };
}

// Run with streaming input if we have MCP servers
const promptInput = sessionId ? generateMessages() : input.prompt;

for await (const message of query({
  prompt: promptInput,
  options,
})) {
  emit(message as OutputMessage);
}
```

### Step 3: Update Rust backend to pass sessionId
**File:** `src-tauri/src/claude_headless.rs`

Currently `session_id` in `AgentServiceInput` is used for SDK resume. Add a separate field for our session ID:

```rust
struct AgentServiceInput {
    action: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,        // SDK resume session ID
    #[serde(skip_serializing_if = "Option::is_none")]
    claude_sessions_id: Option<String>, // Our session ID for custom tools
    cwd: String,
    // ...
}

// In start_claude_agent():
let input = AgentServiceInput {
    action: if resume_id.is_some() { "resume" } else { "query" }.to_string(),
    prompt,
    session_id: resume_id,              // For SDK resume
    claude_sessions_id: Some(session_id.clone()), // For our custom tools
    cwd: cwd.clone(),
    // ...
};
```

**File:** `scripts/agent-service/src/index.ts`

Update the input interface:
```typescript
interface AgentInput {
  action: "query" | "resume";
  prompt: string;
  sessionId?: string;           // SDK resume session ID
  claudeSessionsId?: string;    // Our session ID for custom tools
  cwd: string;
  // ...
}
```

### Step 4: Remove old MCP bridge infrastructure
**Files to modify/delete:**

1. **Delete:** `scripts/mcp-bridge.cjs` (no longer needed)

2. **Modify:** `src-tauri/src/lib.rs`
   - Remove or simplify `configure_worktree()` function
   - Keep only essential worktree setup (no MCP/settings config)

3. **Modify:** Frontend code calling `configure_worktree` (if any)
   - Update to use simplified version or remove calls

### Step 5: Add zod dependency
**File:** `scripts/agent-service/package.json`

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "zod": "^3.23.0"
  }
}
```

### Step 6: Update allowed tools
**File:** `scripts/agent-service/src/index.ts`

Add MCP tool permissions to allowedTools:
```typescript
allowedTools: [
  ...(input.options?.allowedTools || []),
  "mcp__claude-sessions__notify_ready",
  "mcp__claude-sessions__notify_busy",
  "mcp__claude-sessions__get_pending_comments",
  "mcp__claude-sessions__reply_to_comment",
  "mcp__claude-sessions__resolve_comment",
  "mcp__claude-sessions__request_review"
]
```

## Files to Modify
1. `scripts/agent-service/src/index.ts` - Add SDK custom tools
2. `scripts/agent-service/package.json` - Add zod dependency
3. `src-tauri/src/claude_headless.rs` - Pass sessionId to agent
4. `src-tauri/src/lib.rs` - Simplify/remove `configure_worktree()`

## Files to Delete
1. `scripts/mcp-bridge.cjs` - Replaced by SDK custom tools

## Testing
1. Start a new Claude session
2. Verify `notify_ready` tool works (sends message to inbox)
3. Verify `get_pending_comments` returns comments
4. Verify `reply_to_comment` and `resolve_comment` work
5. Verify no `.mcp.json` is created in worktree

## Acceptance Criteria
- [ ] Custom tools defined using SDK `createSdkMcpServer()` and `tool()`
- [ ] `notify_ready` tool works end-to-end
- [ ] `get_pending_comments` / `reply_to_comment` / `resolve_comment` work
- [ ] `mcp-bridge.cjs` deleted
- [ ] `configure_worktree()` simplified (no MCP config)
- [ ] No `.mcp.json` or `.claude/settings.local.json` created in worktrees
