# US-019: Lazy Terminal Sessions with Auto-Idle

## Problem
- All sessions spawn PTY terminals on app startup
- 7+ sessions crashed the app (resource exhaustion)
- No way to "pause" unused sessions to save resources

## Solution
Lazy terminal initialization with auto-idle after 5 minutes of inactivity.

## Session Lifecycle

```
                           click
┌─────────┐  ────────────────────────────────►  ┌─────────────┐
│  IDLE   │                                     │ RUNNING     │
│ (dimmed)│  ◄────────────────────────────────  │ (active)    │
└─────────┘     5min inactivity + not busy      └─────────────┘
```

## Implementation Steps

### 1. sessions.ts - Add idle phase and activity tracking
```typescript
// Add to SessionPhase union
| { type: "idle" }

// Add to Session interface
lastActivityAt?: number;

// Add new actions
activateSession(id): transition idle → running_claude (with --continue)
updateActivity(id): set lastActivityAt = Date.now()
idleSession(id): transition running_claude → idle
```

### 2. sessions.ts - loadFromStorage sets restored sessions as idle
```typescript
phase: { type: "idle" } as SessionPhase,  // NOT running_claude
```

### 3. Sidebar.tsx - Activate on click, show spinner, dim idle
```typescript
// On click idle session:
if (session.phase.type === "idle") {
  activateSession(session.id);
}

// Visual indicators:
const isIdle = session.phase.type === "idle";
const isBusy = session.status === "busy";
// Show spinner for busy, dim for idle
```

### 4. Terminal.tsx - Track activity, handle phase changes
```typescript
// On PTY data received:
updateActivity(sessionId);

// On user input:
updateActivity(sessionId);

// Effect to cleanup when phase becomes idle
useEffect(() => {
  if (phase.type === "idle" && ptyRef.current) {
    ptyRef.current.kill();
    ptyRef.current = null;
  }
}, [phase.type]);
```

### 5. Auto-idle timer (in sessions.ts or App.tsx)
```typescript
// Every 30 seconds, check for idle candidates
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  sessions.forEach(s => {
    if (s.phase.type === "running_claude"
        && s.status !== "busy"
        && Date.now() - s.lastActivityAt > IDLE_TIMEOUT) {
      idleSession(s.id);
    }
  });
}, 30000);
```

### 6. CSS for visual indicators
```css
.session-idle { opacity: 0.6; }
.session-busy-spinner { /* spinning animation */ }
```

## Files to Modify
| File | Changes |
|------|---------|
| src/store/sessions.ts | idle phase, lastActivityAt, activateSession, idleSession |
| src/components/Sidebar.tsx | activate on click, spinner, dim styling |
| src/components/Terminal.tsx | activity tracking, idle cleanup |
| src/App.css | idle dimming, spinner animation |

## Test Checklist
- [ ] Start app with 10+ sessions - no crash
- [ ] All restored sessions appear dimmed
- [ ] Click idle session - PTY starts, session un-dims
- [ ] Busy session shows spinner
- [ ] After 5min idle, session goes back to idle state
