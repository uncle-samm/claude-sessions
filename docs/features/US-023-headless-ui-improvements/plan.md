# Plan: HeadlessChat UI Improvements (US-023)

## Overview
Enhance the HeadlessChat UI to be more polished and feature-rich, inspired by design references and Claude Code's patterns.

## User Requirements
1. **Prettier UI** - Match design reference images (dark theme, cards, badges, expandable sections)
2. **Tab** - Toggle extended thinking mode on/off
3. **Shift+Tab** - Cycle through modes: normal → acceptEdits → plan
4. **Session History** - Load previous Claude Code sessions from `~/.claude/projects/`
5. **TodoWrite Display** - Always show at bottom, hide with Ctrl+T
6. **Tool-specific UI** - Better rendering for each tool type

## Design References Analysis
From `imgs/design-reference-[1-4].png`:
- **Image 1**: Multi-pane with chat, diff viewer (red/green), review comments
- **Image 2**: Edit Result with inline diff, "Processing..." indicator
- **Image 3**: Todo List with checkable items, priority badges (high/medium), strikethrough
- **Image 4**: Expandable Read Result with "Expand" button, Tool Result file lists

## Architecture

### Claude Code Session Storage
Sessions stored at: `~/.claude/projects/[encoded-path]/[session-uuid].jsonl`
```json
{"type":"user","message":{"role":"user","content":"Hello"},"timestamp":"..."}
{"type":"assistant","message":{"role":"assistant","content":[...]},"timestamp":"..."}
```

### Keyboard Shortcuts to Add
| Key | Action |
|-----|--------|
| Tab | Toggle thinking mode (sticky) |
| Shift+Tab | Cycle: normal → acceptEdits → plan → normal |
| Ctrl+T | Toggle TodoWrite panel visibility |

### Mode Indicator Display
Show current mode in header:
- Normal: (no indicator)
- AcceptEdits: "Auto-accept on"
- Plan: "Plan mode on"
- Thinking: "Thinking enabled"

---

## Implementation Steps

### Phase 1: Feature Documentation
1. Create `docs/features/US-023-headless-ui-improvements/`
2. Create `stories.json` with requirements
3. Copy this plan to `plan.md`

### Phase 2: Session Persistence (like `claude --continue`)
**Files:** `src-tauri/src/claude_sessions.rs`, `src/store/messages.ts`

When reopening a session, load previous messages so it continues where you left off.

**Option A: Read from Claude's storage**
Claude Code stores sessions at `~/.claude/projects/[encoded-path]/[session-uuid].jsonl`
- On session load, find matching session file by session_id
- Parse JSONL and populate message store
- When sending new message, use `--resume <session_id>` to continue

**Option B: Store our own copy**
- Save messages to our SQLite DB as they arrive
- Reload from DB when session is reopened
- Still use `--resume` for Claude context

**Recommended: Option A** - Use Claude's own storage to ensure context matches

```rust
#[tauri::command]
pub async fn load_claude_session_messages(
    claude_session_id: String,
    project_path: String
) -> Result<Vec<Message>, String> {
    // Encode project_path like Claude does (base64 or similar)
    // Find ~/.claude/projects/[encoded]/[claude_session_id].jsonl
    // Parse JSONL lines into Messages
    // Return for display
}
```

**Flow:**
1. User opens app, selects a session
2. If `claudeSessionId` exists in session store, call `load_claude_session_messages`
3. Populate message store with history
4. New messages use `--resume <claudeSessionId>`

### Phase 3: Keyboard Shortcuts
**Files:** `src/components/HeadlessChat/InputArea.tsx`, `src/store/settings.ts`

1. Create settings store for thinking mode + permission mode
2. Add global keydown listener for Tab/Shift+Tab
3. Pass mode flags to `start_claude_headless` command
4. Display mode indicator in header

```typescript
// src/store/settings.ts
interface SettingsState {
  thinkingEnabled: boolean;
  permissionMode: 'normal' | 'acceptEdits' | 'plan';
}
```

### Phase 4: TodoWrite Component
**Files:** `src/components/HeadlessChat/TodoList.tsx`, `src/store/todos.ts`

1. Parse `tool_use` blocks with `name: "TodoWrite"`
2. Extract todo items with status (pending/in_progress/completed)
3. Render as sticky bottom panel (inspired by design-reference-3.png)
4. Toggle visibility with Ctrl+T
5. Show priority badges (high=red, medium=yellow)

```tsx
interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority?: 'high' | 'medium' | 'low';
}
```

### Phase 5: Enhanced Tool Renderers
**Files:** `src/components/HeadlessChat/ToolCall.tsx`, new tool components

Based on design references:

1. **Read Tool** (design-reference-4.png style)
   - Collapsible header with file icon + path
   - "Expand" button on right
   - Preview thumbnail/snippet when collapsed
   - Full content with syntax highlighting when expanded

2. **Edit Tool** (design-reference-2.png style)
   - Inline diff with line numbers
   - Red background for removed lines
   - Green background for added lines
   - "Processing..." indicator during operation

3. **Bash Tool**
   - Command in monospace box
   - Output in scrollable pre block
   - Exit code badge (green=0, red=non-zero)
   - Copy button for command

4. **TodoWrite Tool** (design-reference-3.png style)
   - Checkable items with strikethrough
   - Priority badges (high/medium)
   - Progress indicator (X of Y done)
   - Token count display

5. **Glob/Grep Tools**
   - File count badge
   - Expandable file list
   - Syntax highlighting for matches

### Phase 6: Visual Polish
**Files:** `src/components/HeadlessChat/styles.css`

1. **Cards**: Rounded corners, subtle shadows, hover states
2. **Headers**: Icon + title + status badges
3. **Progress indicators**: Spinner with "Processing..." text
4. **Token display**: Show "Tokens: X in, Y out" like design-reference-3.png
5. **Message bubbles**: Better spacing, timestamps
6. **Code blocks**: Copy button, syntax highlighting

### Phase 7: Thinking Block Support
**Files:** `src/store/messages.ts`, `src/components/HeadlessChat/ThinkingBlock.tsx`

1. Add `ThinkingContent` type to message store
2. Parse `{"type": "thinking", "thinking": "..."}` blocks
3. Render as collapsible gray italic text
4. Toggle visibility with Ctrl+O (verbose mode)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/features/US-023-headless-ui-improvements/stories.json` | CREATE | Requirements tracking |
| `docs/features/US-023-headless-ui-improvements/plan.md` | CREATE | Implementation plan |
| `src-tauri/src/claude_sessions.rs` | CREATE | Session history loading |
| `src-tauri/src/lib.rs` | MODIFY | Register new commands |
| `src/store/settings.ts` | CREATE | Thinking/permission mode state |
| `src/store/todos.ts` | CREATE | Todo list state |
| `src/store/messages.ts` | MODIFY | Add ThinkingContent type |
| `src/components/HeadlessChat/TodoList.tsx` | CREATE | Sticky todo panel |
| `src/components/HeadlessChat/ThinkingBlock.tsx` | CREATE | Thinking display |
| `src/components/HeadlessChat/ToolCall.tsx` | MODIFY | Enhanced renderers |
| `src/components/HeadlessChat/InputArea.tsx` | MODIFY | Keyboard shortcuts |
| `src/components/HeadlessChat/index.tsx` | MODIFY | Mode indicators, shortcuts |
| `src/components/HeadlessChat/styles.css` | MODIFY | Visual polish |

---

## Testing Plan

1. **Tab/Shift+Tab**: Verify mode toggles and indicator updates
2. **Session Loading**: Load an existing Claude session, verify messages display
3. **TodoWrite**: Trigger a TodoWrite tool, verify panel shows
4. **Ctrl+T**: Toggle todo panel visibility
5. **Tool Rendering**: Test each tool type (Read, Edit, Bash, etc.)
6. **Thinking Blocks**: Enable thinking, verify gray italic display
7. **Visual**: Compare to design reference images

---

## User Decisions

1. **Session persistence**: Load previous messages when reopening session (like `claude --continue`)
2. **Diff display**:
   - **Inline diff** (in chat) = what Edit tool just changed (removed/added)
   - **Side panel** (DiffViewer) = full PR-like diff of ALL changes for code review
3. **Default mode**: Normal (asks permission for edits)
4. **Priority**: Implement all features at once
