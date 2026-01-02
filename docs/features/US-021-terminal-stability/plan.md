# Plan: Fix Terminal Stability Issues (US-021)

## First: Create Feature Documentation
- Create `docs/features/US-021-terminal-stability/`
- Create `stories.json` with requirements
- Copy plan.md to that folder

## Problems
1. **Spinner flickering** - busy state changes rapidly because we set `busy=false` on every data chunk without "to interrupt)"
2. **Random newlines** - overly aggressive filtering of bare newlines causes cursor position issues
3. **Question marks for characters** - missing UTF-8 locale env vars in PTY spawn
4. **General flickering** - no batching of PTY writes, each write triggers immediate render
5. **Resize flickering** - resize handler not debounced

## Solution Overview
Stabilize the terminal by:
1. Debouncing busy state detection (only go not-busy after 300ms without "to interrupt)")
2. Batching PTY data writes with requestAnimationFrame
3. Adding proper UTF-8 locale environment variables
4. Loading WebGL addon for GPU-accelerated rendering
5. Debouncing resize handler
6. Removing overly aggressive newline filtering

## Implementation

### 1. Debounce Busy State Detection
**File: `src/components/Terminal.tsx`**

```typescript
// Add ref for debounce timer
const busyTimeoutRef = useRef<number | null>(null);

// In pty.onData():
if (data.includes("to interrupt)")) {
  // Clear any pending "not busy" timeout
  if (busyTimeoutRef.current) {
    clearTimeout(busyTimeoutRef.current);
    busyTimeoutRef.current = null;
  }
  setClaudeBusy(sessionId, true);
} else if (session is currently busy) {
  // Only set not-busy after 300ms of no "to interrupt)" messages
  if (!busyTimeoutRef.current) {
    busyTimeoutRef.current = window.setTimeout(() => {
      setClaudeBusy(sessionId, false);
      busyTimeoutRef.current = null;
    }, 300);
  }
}
```

### 2. Batch PTY Writes with RAF
**File: `src/components/Terminal.tsx`**

```typescript
// Add refs for batching
const pendingDataRef = useRef<string>('');
const rafIdRef = useRef<number | null>(null);

// Replace direct terminal.write() with batched version:
pty.onData((data) => {
  if (data.length === 0) return;

  pendingDataRef.current += data;

  if (rafIdRef.current === null) {
    rafIdRef.current = requestAnimationFrame(() => {
      if (pendingDataRef.current) {
        terminal.write(pendingDataRef.current);
        // Process busy detection on batched data
        processBusyDetection(pendingDataRef.current);
        pendingDataRef.current = '';
      }
      rafIdRef.current = null;
    });
  }
});
```

### 3. Add UTF-8 Locale Environment Variables
**File: `src/components/Terminal.tsx`**

```typescript
const pty = await spawn("/bin/zsh", ["-l", "-c", claudeCmd], {
  cols: terminal.cols,
  rows: terminal.rows,
  cwd: cwd || undefined,
  env: {
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
  },
});
```

### 4. Load WebGL Addon for Better Performance
**File: `src/components/Terminal.tsx`**

```typescript
import { WebglAddon } from "@xterm/addon-webgl";

// After terminal.open():
try {
  const webglAddon = new WebglAddon();
  webglAddon.onContextLoss(() => {
    webglAddon.dispose();
  });
  terminal.loadAddon(webglAddon);
} catch (e) {
  console.warn('[Terminal] WebGL not available, using default renderer');
}
```

### 5. Debounce Resize Handler
**File: `src/components/Terminal.tsx`**

```typescript
const resizeTimeoutRef = useRef<number | null>(null);

const handleResize = () => {
  if (resizeTimeoutRef.current) {
    clearTimeout(resizeTimeoutRef.current);
  }
  resizeTimeoutRef.current = window.setTimeout(() => {
    if (fitAddonRef.current && isActiveRef.current) {
      fitAddonRef.current.fit();
    }
    resizeTimeoutRef.current = null;
  }, 50);
};
```

### 6. Remove Aggressive Newline Filtering
**File: `src/components/Terminal.tsx`**

```typescript
// REMOVE this filtering - it causes cursor position issues:
// if (data === '\n' || data === '\r' || data === '\r\n') return;

// Just skip truly empty data:
if (data.length === 0) return;
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/Terminal.tsx` | All 6 fixes above |

## Test Plan

1. Start session with Claude
2. Give Claude a long-running task
3. Verify: Spinner appears and stays steady (no flickering)
4. Verify: Spinner disappears 300ms after Claude finishes
5. Check console for "WebGL" addon loaded message
6. Type special characters (emojis, accented chars) - should display correctly
7. Resize window rapidly - no flickering or misaligned text
8. Check terminal output for random newlines - should be gone

## Cleanup

After cleanup, can remove from cleanup section:
- `@xterm/addon-canvas` from package.json (keeping webgl only)
