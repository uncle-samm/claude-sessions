# Plan: Fix Spinner to Detect Real Activity

## Problem
Spinners show on sessions where Claude isn't working. DB status is unreliable because:
- Only updated when Claude calls MCP tools (`notify_ready`/`notify_busy`)
- Status stays `busy` when Claude finishes without sending inbox message
- Status gets "frozen" when sessions go idle

## Solution
Detect Claude's working state directly from terminal output, not from DB status.

**Key insight:** When Claude is working, the terminal shows "(esc to interrupt)". This is the definitive signal.

## Implementation

### 1. Add `isClaudeBusy` state to Session

**File: `src/store/sessions.ts`**

```typescript
interface Session {
  // ... existing fields
  isClaudeBusy?: boolean;  // True when terminal shows "(esc to interrupt)"
}

// New action
setClaudeBusy: (id: string, busy: boolean) => void;
```

### 2. Parse terminal output for busy indicator

**File: `src/components/Terminal.tsx`**

In the PTY data handler:
```typescript
pty.onData((data) => {
  terminal.write(data);
  updateActivity(sessionId);

  // Detect Claude busy state from terminal output
  if (data.includes("esc to interrupt")) {
    setClaudeBusy(sessionId, true);
  }
  // Detect when Claude returns to prompt
  else if (/* prompt pattern detected */) {
    setClaudeBusy(sessionId, false);
  }
});
```

### 3. Update Sidebar to use `isClaudeBusy`

**File: `src/components/Sidebar.tsx`**

```typescript
// OLD: const isBusy = session.phase.type === "running_claude" && !session.awaitingInput;
// NEW:
const isBusy = session.phase.type === "running_claude" && session.isClaudeBusy;
```

## Patterns to Detect (Confirmed via screenshot)

**Claude is BUSY when:**
- Terminal output contains `(esc to interrupt)` - this is THE reliable indicator

**Claude is READY when:**
- The `(esc to interrupt)` disappears
- Detect `> ` prompt appearing after busy state

## Files to Modify

| File | Change |
|------|--------|
| `src/store/sessions.ts` | Add `isClaudeBusy` field and `setClaudeBusy` action |
| `src/components/Terminal.tsx` | Detect "(esc to interrupt)" and prompt patterns |
| `src/components/Sidebar.tsx` | Use `isClaudeBusy` for spinner logic |

## Edge Cases

- Multiple "(esc to interrupt)" in quick succession → stay busy
- HMR reload → session state should reset to not busy
- Session activation → default to not busy until we see the indicator
