# US-019: Lazy Terminal Sessions with Auto-Idle

## What Was Built
Implemented lazy terminal initialization to prevent resource exhaustion when many sessions exist.

### Key Changes

1. **Added "idle" phase** (`src/store/sessions.ts:6`)
   - New phase in SessionPhase union
   - Sessions load as idle (no PTY spawned)

2. **Activity tracking** (`src/store/sessions.ts:27,210-215`)
   - Added `lastActivityAt` timestamp field
   - `updateActivity()` called on PTY data and user input

3. **Session activation** (`src/store/sessions.ts:218-229`)
   - `activateSession()` transitions idle → running_claude
   - Called when clicking idle session or auto-activated on app load

4. **Auto-idle timer** (`src/store/sessions.ts:292-315`)
   - Checks every 30s for sessions inactive > 5 minutes
   - Only idles if Claude is not busy (awaitingInput === true)

5. **Sidebar changes** (`src/components/Sidebar.tsx:182-204`)
   - Idle sessions appear dimmed (opacity: 0.6)
   - Busy sessions show orange spinner
   - Click activates idle sessions

6. **Terminal activity tracking** (`src/components/Terminal.tsx:137-138,147-148`)
   - PTY data and user input call `updateActivity()`

7. **Auto-activate on load** (`src/App.tsx:70-77`)
   - Active session auto-activates if idle

## CSS Added (`src/App.css:585-607`)
- `.session-idle` - 60% opacity for dimmed appearance
- `.session-busy-spinner` - Orange animated spinner

## Fixes Made
- Double PTY spawn on HMR: Fixed by refining useEffect dependencies (`src/App.tsx:77`)
- Active session not activating: Added auto-activate effect (`src/App.tsx:70-77`)

## Updated CLAUDE.md
Added critical workflow reminder at top to ensure feature documentation is created before coding.

## Commit Hash
371ba7b4beb13b51c1a63129bdc812a4beb17901
