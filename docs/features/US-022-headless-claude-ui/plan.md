# Plan: Replace Terminal with Headless Claude Code UI (US-022)

## User Decisions
- **Fallback**: Headless only - remove terminal completely
- **Detail level**: Full details - show all tool calls, file contents, diffs inline
- **Approach**: Full replacement - build complete feature parity before switching

## Problem
The xterm.js terminal has inherent issues:
- Claude Code bug #7670 inserts hard line breaks at ~80 chars
- PTY newline noise causes rendering artifacts
- No control over output formatting
- Can't style/interact with individual messages

## Solution
Replace the terminal with a **headless mode UI** that communicates with Claude Code via JSON streaming.

## How It Works

### Claude Code Headless Mode
```bash
# Non-interactive mode with JSON streaming
claude -p "your prompt" --output-format stream-json

# Multi-turn conversation
claude --continue -p "follow up" --output-format stream-json
claude --resume <session_id> -p "follow up" --output-format stream-json
```

### JSON Message Format
Each message is a JSON object:
```json
// Init message
{"type": "system", "subtype": "init", "session_id": "abc123", ...}

// Assistant message
{"type": "assistant", "message": {"role": "assistant", "content": [...]}}

// Tool use
{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Read", ...}]}}

// Final result
{"type": "result", "subtype": "success", "result": "...", "total_cost_usd": 0.003}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ MessageList │  │ ToolOutput │  │ InputBox + Actions  │ │
│  │ (styled)    │  │ (collapsible)│ │ (plan/edit/approve) │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ Tauri Events
┌────────────────────────┴────────────────────────────────────┐
│                     Rust Backend                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ClaudeProcess                                           ││
│  │ - spawn("claude", ["-p", "--output-format", "stream-json"])│
│  │ - parse JSON lines from stdout                          ││
│  │ - emit events: claude-message, claude-tool, claude-done ││
│  │ - receive user input via channel → write to stdin       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 0: Create Feature Documentation (FIRST!)
1. Create folder: `docs/features/US-022-headless-claude-ui/`
2. Create `stories.json` with the content defined below
3. Copy this plan to `plan.md` in that folder

### Phase 1: Create Rust Backend for Headless Claude
**File: `src-tauri/src/claude_headless.rs`**

1. Spawn Claude CLI with headless flags
2. Read stdout line by line (JSON stream)
3. Parse each JSON message
4. Emit Tauri events to frontend
5. Handle stdin for multi-turn input

```rust
// Pseudo-code
fn start_claude_session(prompt: String, session_id: Option<String>) {
    let mut cmd = Command::new("claude");
    cmd.args(["-p", &prompt, "--output-format", "stream-json"]);

    if let Some(id) = session_id {
        cmd.args(["--resume", &id]);
    }

    let child = cmd.stdin(Stdio::piped())
                   .stdout(Stdio::piped())
                   .spawn()?;

    // Read JSON lines and emit events
    for line in BufReader::new(child.stdout).lines() {
        let msg: ClaudeMessage = serde_json::from_str(&line)?;
        app.emit("claude-message", &msg)?;
    }
}
```

### Phase 2: Create React Components
**Files: `src/components/HeadlessChat/`**

1. **MessageList.tsx** - Render assistant/user messages with markdown
2. **ToolCall.tsx** - Collapsible tool usage (Read, Edit, Bash, etc.)
3. **CodeBlock.tsx** - Syntax highlighted code with copy button
4. **InputArea.tsx** - Text input + submit + mode switcher (plan/edit)
5. **SessionView.tsx** - Main container, manages state

### Phase 3: Replace Terminal Component
**File: `src/components/SessionContainer.tsx`**

Replace `<Terminal>` with `<HeadlessChat>` for `running_claude` phase.

### Phase 4: Handle Permissions & Approvals
1. Parse tool_use messages
2. Show approval UI for file edits
3. Send approval/rejection back via stdin

## Key Files to Modify

| File | Change |
|------|--------|
| `src-tauri/src/lib.rs` | Add claude_headless module + commands |
| `src-tauri/src/claude_headless.rs` | NEW: Headless Claude process manager |
| `src/components/HeadlessChat/` | NEW: React chat components |
| `src/components/Terminal.tsx` | DELETE (replaced by HeadlessChat) |
| `src/App.tsx` | Replace Terminal with HeadlessChat |
| `src/store/messages.ts` | NEW: Message state for headless mode |

## What Stays the Same

Based on codebase exploration, these can remain unchanged:
- `src/store/sessions.ts` - Session phase state machine (already well-designed)
- `src/store/workspaces.ts` - Workspace management
- `src/store/diffs.ts`, `src/store/comments.ts` - Diff/comment system
- `src-tauri/src/db.rs` - SQLite database layer
- `src-tauri/src/server.rs` - HTTP API on port 19420
- `scripts/mcp-bridge.cjs` - MCP tool handlers
- `scripts/start-session.sh` - Worktree setup script

## Detailed Implementation

### Phase 1: Rust Backend (`src-tauri/src/claude_headless.rs`)

```rust
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ClaudeMessage {
    #[serde(rename = "system")]
    System { subtype: String, session_id: Option<String> },
    #[serde(rename = "user")]
    User { message: serde_json::Value },
    #[serde(rename = "assistant")]
    Assistant { message: serde_json::Value },
    #[serde(rename = "result")]
    Result { subtype: String, result: String, total_cost_usd: f64 },
}

#[tauri::command]
pub async fn start_claude_headless(
    app: AppHandle,
    session_id: String,
    prompt: String,
    cwd: String,
    resume_id: Option<String>,
) -> Result<(), String> {
    let mut cmd = Command::new("claude");
    cmd.args(["-p", &prompt, "--output-format", "stream-json"]);

    if let Some(id) = resume_id {
        cmd.args(["--resume", &id]);
    }

    cmd.current_dir(&cwd)
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().unwrap();

    // Spawn thread to read JSON lines
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            if let Ok(msg) = serde_json::from_str::<ClaudeMessage>(&line) {
                let _ = app.emit(&format!("claude-message:{}", session_id), &msg);
            }
        }
        let _ = app.emit(&format!("claude-done:{}", session_id), ());
    });

    Ok(())
}

#[tauri::command]
pub async fn send_claude_input(session_id: String, input: String) -> Result<(), String> {
    // Send input to running Claude process via stored stdin handle
    // Implementation depends on process registry
    Ok(())
}
```

### Phase 2: React Components

**`src/store/messages.ts`** - Message state
```typescript
interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool';
  content: MessageContent[];
  timestamp: number;
}

interface MessageContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'code';
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
}
```

**`src/components/HeadlessChat/MessageList.tsx`**
- Render messages with markdown support
- Syntax highlighting for code blocks
- Inline tool calls with full details

**`src/components/HeadlessChat/ToolCall.tsx`**
- Display tool name, inputs, outputs
- File reads show full content
- Edits show before/after diff
- Bash shows command + output

**`src/components/HeadlessChat/InputArea.tsx`**
- Multi-line text input
- Submit button
- Permission mode selector (plan/edit/accept)

## Benefits

1. **No terminal rendering bugs** - Custom React components
2. **Full control over styling** - Can theme messages, code blocks
3. **Better UX for approvals** - Native buttons instead of terminal prompts
4. **Collapsible tool output** - Hide verbose Read/Bash output
5. **Markdown rendering** - Proper formatting of Claude's responses
6. **Session management** - Easy continue/resume with session IDs

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Headless mode missing features | Check Claude Code docs for parity |
| Complex ANSI parsing | JSON mode has no ANSI codes |
| Permission handling | Use `--permission-mode acceptEdits` or handle prompts |
| Multi-turn state | Use `--resume <session_id>` |

## Test Plan (COMPREHENSIVE - NO LAZINESS)

### Test 1: Basic Headless Communication
**Steps:**
1. Run `claude -p "say hello" --output-format stream-json` manually in terminal
2. Verify JSON output format
3. Implement Rust backend to spawn this command
4. Verify Tauri events are emitted
5. Check frontend receives events via `listen()`

**Verification:**
- [ ] Console shows JSON lines from Claude
- [ ] Each line parses as valid JSON
- [ ] Frontend event handler fires

### Test 2: Message Rendering
**Steps:**
1. Send simple prompt via headless mode
2. Verify assistant message renders in MessageList
3. Check markdown formatting works
4. Test code blocks with syntax highlighting
5. Verify timestamps display correctly

**Verification:**
- [ ] Text messages display with proper formatting
- [ ] Code blocks have syntax highlighting
- [ ] No raw JSON visible to user

### Test 3: Tool Call Display (Read)
**Steps:**
1. Send prompt: "read package.json"
2. Verify tool_use message is captured
3. Check ToolCall component renders with:
   - Tool name: "Read"
   - Input: file path
   - Output: file contents
4. Verify full file content is shown (not truncated)

**Verification:**
- [ ] Tool call header shows "Read"
- [ ] File path is displayed
- [ ] Full file contents visible
- [ ] Proper code formatting

### Test 4: Tool Call Display (Edit)
**Steps:**
1. Send prompt: "add a comment to package.json"
2. Verify Edit tool_use renders with:
   - Tool name: "Edit"
   - old_string shown
   - new_string shown
   - Diff highlighting (red/green)

**Verification:**
- [ ] Edit shows file path
- [ ] Before/after diff visible
- [ ] Red for removed, green for added

### Test 5: Tool Call Display (Bash)
**Steps:**
1. Send prompt: "run ls -la"
2. Verify Bash tool renders with:
   - Command shown
   - Output shown
   - Exit code (if non-zero)

**Verification:**
- [ ] Command displayed in code block
- [ ] Output displayed below
- [ ] Scrollable if long output

### Test 6: Multi-Turn Conversation
**Steps:**
1. Start session, get session_id from init message
2. Send follow-up with `--resume <session_id>`
3. Verify context is maintained
4. Check message history displays correctly

**Verification:**
- [ ] Session ID captured from init
- [ ] Resume works with same session
- [ ] Previous messages visible
- [ ] Context maintained (Claude remembers)

### Test 7: User Input
**Steps:**
1. Type message in InputArea
2. Click submit or press Enter
3. Verify message sent to Claude
4. Check user message renders in chat
5. Wait for assistant response

**Verification:**
- [ ] Input clears after submit
- [ ] User message appears immediately
- [ ] Loading indicator shows
- [ ] Assistant response arrives

### Test 8: Permission Modes
**Steps:**
1. Test with `--permission-mode plan`
   - Verify Claude can only read, not write
2. Test with `--permission-mode acceptEdits`
   - Verify edits auto-approved
3. Test default mode
   - Verify permission prompts work

**Verification:**
- [ ] Plan mode blocks writes
- [ ] Accept mode auto-approves
- [ ] Default prompts for approval

### Test 9: Error Handling
**Steps:**
1. Test with invalid prompt
2. Test when Claude process crashes
3. Test network timeout scenario
4. Verify error messages display

**Verification:**
- [ ] Error state shown in UI
- [ ] Can retry/restart session
- [ ] No crash or hang

### Test 10: Session Lifecycle
**Steps:**
1. Create new session
2. Session appears in sidebar
3. Send messages, verify they persist
4. Close session
5. Reopen session (via --continue)
6. Verify history loaded

**Verification:**
- [ ] New session creates properly
- [ ] Messages persist across interaction
- [ ] Session can be continued
- [ ] Full history available

### Test 11: Comparison with Terminal
**Steps:**
1. Run same prompt in terminal version
2. Run same prompt in headless version
3. Compare:
   - All tool calls visible?
   - Same information displayed?
   - Response quality identical?

**Verification:**
- [ ] Feature parity achieved
- [ ] No information loss
- [ ] Better or equal UX

## Stories.json Content (to be created at docs/features/US-022-headless-claude-ui/)

```json
{
  "id": "US-022",
  "title": "Replace Terminal with Headless Claude Code UI",
  "type": "feature",
  "description": "Replace xterm.js terminal with a headless mode UI that communicates with Claude Code via JSON streaming, providing full control over rendering and eliminating terminal bugs",
  "status": "pending",
  "requirements": [
    {"item": "Create Rust backend to spawn Claude with --output-format stream-json", "done": false},
    {"item": "Parse JSON stream and emit Tauri events", "done": false},
    {"item": "Create MessageList component for rendering messages", "done": false},
    {"item": "Create ToolCall component for Read/Edit/Bash display", "done": false},
    {"item": "Create InputArea component for user input", "done": false},
    {"item": "Handle multi-turn conversations with --resume", "done": false},
    {"item": "Support permission modes (plan/edit/accept)", "done": false},
    {"item": "Remove Terminal.tsx and xterm.js dependencies", "done": false},
    {"item": "Integrate with existing session store", "done": false},
    {"item": "Handle errors and edge cases gracefully", "done": false}
  ],
  "e2eTests": [
    {
      "name": "Basic headless communication",
      "steps": [
        "Run claude -p 'say hello' --output-format stream-json",
        "Verify JSON output format",
        "Start session via Tauri command",
        "Verify frontend receives events"
      ],
      "done": false
    },
    {
      "name": "Message rendering",
      "steps": [
        "Send simple prompt",
        "Verify message renders with markdown",
        "Check code blocks have syntax highlighting"
      ],
      "done": false
    },
    {
      "name": "Tool call display - Read",
      "steps": [
        "Send 'read package.json'",
        "Verify tool name shows 'Read'",
        "Verify full file content displayed"
      ],
      "done": false
    },
    {
      "name": "Tool call display - Edit",
      "steps": [
        "Send prompt that triggers edit",
        "Verify diff shows old/new strings",
        "Verify red/green highlighting"
      ],
      "done": false
    },
    {
      "name": "Tool call display - Bash",
      "steps": [
        "Send 'run ls -la'",
        "Verify command displayed",
        "Verify output displayed"
      ],
      "done": false
    },
    {
      "name": "Multi-turn conversation",
      "steps": [
        "Start session, capture session_id",
        "Send follow-up with --resume",
        "Verify context maintained"
      ],
      "done": false
    },
    {
      "name": "User input flow",
      "steps": [
        "Type message in InputArea",
        "Submit message",
        "Verify user message renders",
        "Verify assistant response arrives"
      ],
      "done": false
    },
    {
      "name": "Permission modes",
      "steps": [
        "Test --permission-mode plan (read only)",
        "Test --permission-mode acceptEdits (auto approve)",
        "Test default mode"
      ],
      "done": false
    },
    {
      "name": "Error handling",
      "steps": [
        "Test invalid prompt",
        "Test process crash",
        "Verify error UI displays"
      ],
      "done": false
    },
    {
      "name": "Session lifecycle",
      "steps": [
        "Create new session",
        "Send messages",
        "Close session",
        "Reopen with --continue",
        "Verify history loaded"
      ],
      "done": false
    },
    {
      "name": "Feature parity with terminal",
      "steps": [
        "Run same prompt in terminal version",
        "Run same prompt in headless version",
        "Compare tool calls and information displayed"
      ],
      "done": false
    }
  ],
  "acceptanceCriteria": [
    {"item": "All messages render correctly with markdown", "done": false},
    {"item": "All tool calls (Read, Edit, Bash) display full details", "done": false},
    {"item": "Multi-turn conversations work with --resume", "done": false},
    {"item": "User can type and send messages", "done": false},
    {"item": "Permission modes work correctly", "done": false},
    {"item": "Errors handled gracefully", "done": false},
    {"item": "No terminal rendering bugs (newlines, question marks)", "done": false},
    {"item": "Feature parity with terminal version", "done": false},
    {"item": "Terminal.tsx and xterm.js removed", "done": false}
  ],
  "files": [
    "src-tauri/src/claude_headless.rs",
    "src-tauri/src/lib.rs",
    "src/components/HeadlessChat/index.tsx",
    "src/components/HeadlessChat/MessageList.tsx",
    "src/components/HeadlessChat/ToolCall.tsx",
    "src/components/HeadlessChat/InputArea.tsx",
    "src/store/messages.ts",
    "src/App.tsx",
    "src/components/Terminal.tsx (DELETE)"
  ]
}
```
