# US-026: Replace Headless Mode with Claude Agent SDK (Sidecar)

## Overview

Replace the current Claude CLI-based headless mode with the official Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), packaged as a **self-contained sidecar binary**. This eliminates the need for users to have Node.js installed and provides a proper programmatic API.

## Architecture

### Current (CLI-based)
```
Frontend (React)
    ↓ Tauri IPC
Rust Backend → spawns `claude --output-format stream-json`
    ↓ stdout parsing (fragile)
JSON lines → Tauri events → Frontend
```

### Target (SDK Sidecar)
```
Frontend (React)
    ↓ Tauri IPC (invoke)
Rust Backend
    ↓ Command::sidecar("agent-service")
Bundled Binary (Node.js + Agent SDK)
    ↓ stdout JSON stream
Rust → Tauri events → Frontend
```

## Why Sidecar Binary (Option A)

| Benefit | Description |
|---------|-------------|
| **Self-contained** | No Node.js installation required for end users |
| **Distributable** | Can ship via App Store, DMG, installer |
| **Clean architecture** | Tauri's official sidecar pattern |
| **Offline capable** | All dependencies bundled |
| **Cross-platform** | Build for macOS (arm64/x64), Windows, Linux |

**Trade-off:** ~50-80MB binary size increase per platform

---

## User Stories

### US-026.1: Agent SDK Sidecar Setup
**As a** developer  
**I want** the Agent SDK packaged as a sidecar binary  
**So that** the app is self-contained and users don't need Node.js installed

**Acceptance Criteria:**
- [ ] `scripts/agent-service/` project created with SDK dependency
- [ ] `pkg` configured to build standalone binaries
- [ ] Build script creates binaries for all target triples
- [ ] Binaries placed in `src-tauri/binaries/` with correct naming
- [ ] `tauri.conf.json` configured with `externalBin`
- [ ] Shell plugin permissions configured in `capabilities/default.json`

---

### US-026.2: Agent Service Protocol
**As a** developer  
**I want** a well-defined protocol between Rust and the sidecar  
**So that** communication is reliable and typed

**Acceptance Criteria:**
- [ ] Input: JSON args via command line or stdin
- [ ] Output: Newline-delimited JSON messages to stdout
- [ ] Error output: JSON error objects to stderr
- [ ] Message types match existing `ClaudeMessage` format (or mapped)
- [ ] Session ID returned on init for resumption
- [ ] Graceful shutdown on SIGTERM/SIGINT

**Protocol Spec:**
```
INPUT (argv[1]):
{
  "action": "query" | "resume",
  "prompt": "string",
  "sessionId": "string?",        // for resume
  "cwd": "/path/to/workdir",
  "options": {
    "allowedTools": ["Read", "Edit", "Bash", ...],
    "permissionMode": "acceptEdits" | "bypassPermissions",
    "mcpServers": { ... }
  }
}

OUTPUT (stdout, one JSON per line):
{ "type": "system", "subtype": "init", "session_id": "...", "tools": [...] }
{ "type": "assistant", "message": { "content": [...] } }
{ "type": "result", "subtype": "success", "result": "...", "cost_usd": 0.05 }
```

---

### US-026.3: Rust Sidecar Integration
**As a** developer  
**I want** the Rust backend to spawn and communicate with the sidecar  
**So that** messages flow correctly to the frontend

**Acceptance Criteria:**
- [ ] `claude_headless.rs` updated to use `Command::sidecar()`
- [ ] Process registry tracks sidecar processes per session
- [ ] stdout parsed and emitted as `claude-message` events
- [ ] stderr captured and emitted as `claude-stderr` events
- [ ] Process exit emitted as `claude-done` event
- [ ] Graceful termination on session stop

---

### US-026.4: Session Management via SDK
**As a** user  
**I want** my sessions to persist and resume correctly  
**So that** I can continue conversations across app restarts

**Acceptance Criteria:**
- [ ] SDK session ID stored in local database
- [ ] Resume works via `options.resume` in SDK
- [ ] Session history loads from Convex on app start
- [ ] New messages sync to Convex in real-time
- [ ] Session ID format compatible or migrated

---

### US-026.5: MCP Integration via SDK
**As a** developer  
**I want** MCP servers configured through the SDK  
**So that** Claude can use custom tools (notify_ready, comments, etc.)

**Acceptance Criteria:**
- [ ] SDK `mcpServers` option configured with claude-sessions bridge
- [ ] Existing `mcp-bridge.cjs` works when spawned by SDK
- [ ] `notify_ready` tool works end-to-end
- [ ] `get_pending_comments` / `reply_to_comment` work
- [ ] No regression in MCP functionality

---

### US-026.6: Build Pipeline
**As a** developer  
**I want** automated builds for all platforms  
**So that** distribution is reliable

**Acceptance Criteria:**
- [ ] npm script: `build:sidecar` compiles for current platform
- [ ] npm script: `build:sidecar:all` compiles for all targets
- [ ] Binaries named correctly: `agent-service-{target-triple}[.exe]`
- [ ] Tauri build includes sidecar binaries
- [ ] CI/CD builds all platform variants

**Target Triples:**
- `aarch64-apple-darwin` (macOS Apple Silicon)
- `x86_64-apple-darwin` (macOS Intel)
- `x86_64-pc-windows-msvc` (Windows)
- `x86_64-unknown-linux-gnu` (Linux)

---

### US-026.7: Permission Mode UI
**As a** user  
**I want** to control what Claude can do automatically  
**So that** I can balance convenience and safety

**Acceptance Criteria:**
- [ ] UI toggle in session header or settings
- [ ] Modes: "Ask for approval" / "Auto-approve edits" / "Full auto"
- [ ] Mode persisted per session
- [ ] Mode passed to SDK via `permissionMode` option

---

### US-026.8: Error Handling & Recovery
**As a** user  
**I want** clear error messages when something goes wrong  
**So that** I can fix issues or report bugs

**Acceptance Criteria:**
- [ ] Sidecar crash shows user-friendly error
- [ ] SDK errors (auth, rate limit) displayed clearly
- [ ] Network errors handled gracefully
- [ ] Retry mechanism for transient failures
- [ ] Logs available for debugging

---

## Implementation Plan

### Phase 1: Sidecar Project Setup
1. Create `scripts/agent-service/` directory
2. Initialize npm project with TypeScript
3. Install `@anthropic-ai/claude-agent-sdk`
4. Install `pkg` as dev dependency
5. Create `src/index.ts` with basic query wrapper
6. Add build scripts to `package.json`

### Phase 2: Protocol Implementation
1. Define input/output JSON schemas
2. Implement CLI arg parsing
3. Implement SDK query loop with JSON output
4. Handle session resume
5. Implement graceful shutdown
6. Add error handling and stderr output

### Phase 3: Build Configuration
1. Create `scripts/build-sidecar.js` for cross-platform builds
2. Configure `pkg` targets in `package.json`
3. Create `src-tauri/binaries/` directory
4. Update `tauri.conf.json` with `externalBin`
5. Update `capabilities/default.json` with shell permissions
6. Test build on local platform

### Phase 4: Rust Integration
1. Update `claude_headless.rs`:
   - Replace `Command::new("claude")` with `Command::sidecar()`
   - Update arg passing to JSON format
   - Keep stdout/stderr parsing
   - Keep event emission
2. Update process registry if needed
3. Test basic query flow

### Phase 5: Frontend Updates
1. Verify message types match (or add mapping)
2. Update `HeadlessChat/index.tsx` if needed
3. Test tool call rendering
4. Test session persistence

### Phase 6: MCP Migration
1. Add `mcpServers` config to agent-service
2. Test MCP bridge spawning
3. Verify all MCP tools work
4. Remove old MCP setup code if redundant

### Phase 7: New Features
1. Add permission mode UI
2. Wire up `permissionMode` option
3. Document new capabilities

### Phase 8: Cleanup & Polish
1. Remove legacy CLI spawning code
2. Update error messages
3. Update documentation
4. Add logging/debugging support

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/agent-service/package.json` | Create | Sidecar npm project |
| `scripts/agent-service/src/index.ts` | Create | SDK wrapper entry point |
| `scripts/agent-service/tsconfig.json` | Create | TypeScript config |
| `scripts/build-sidecar.js` | Create | Cross-platform build script |
| `src-tauri/binaries/` | Create | Directory for sidecar binaries |
| `src-tauri/tauri.conf.json` | Edit | Add `externalBin` config |
| `src-tauri/capabilities/default.json` | Edit | Add shell permissions |
| `src-tauri/src/claude_headless.rs` | Edit | Use sidecar instead of CLI |
| `package.json` | Edit | Add sidecar build scripts |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Binary size too large | Use `pkg` compression, strip debug symbols |
| SDK output differs from CLI | Map messages in agent-service |
| Session ID incompatible | Support both formats, migrate on first use |
| MCP bridge fails with SDK | Test early, SDK spawns MCP same way |
| Build fails on CI | Set up GitHub Actions with all targets |
| Auth issues | SDK uses Claude Code auth automatically |

---

## Success Criteria

- [ ] Sidecar builds for macOS (arm64 + x64)
- [ ] Sidecar builds for Windows and Linux
- [ ] App runs without Node.js installed
- [ ] Sessions start and stream messages
- [ ] Sessions resume correctly
- [ ] All tool calls render (Read, Edit, Bash, etc.)
- [ ] MCP tools work (notify_ready, comments)
- [ ] Convex sync works
- [ ] Permission modes work
- [ ] No regression from current functionality

---

## Dependencies

- `@anthropic-ai/claude-agent-sdk` - Agent SDK
- `pkg` - Node.js binary compiler
- `@tauri-apps/plugin-shell` - Sidecar spawning (already installed)

## References

- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Tauri Sidecar Guide](https://v2.tauri.app/learn/sidecar-nodejs/)
- [pkg Documentation](https://github.com/vercel/pkg)
