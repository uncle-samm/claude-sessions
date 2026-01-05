# US-034: Diff Viewer AI Scope Rehydrate

## Status: DONE

## Problem
AI-touched files should persist across app reloads by rehydrating from stored Convex messages, but:
1. MCP-prefixed tools like `mcp__acp__Edit` weren't recognized
2. Rehydration ran too early (before Convex messages loaded), then never re-ran

## Solution

### Fix 1: Handle MCP-prefixed tool names
Added `extractBaseToolName()` function in `src/components/HeadlessChat/index.tsx:74-81`:
```typescript
function extractBaseToolName(name: string): string {
  // Strip MCP prefix pattern: mcp__<server>__<tool>
  const mcpMatch = name.match(/^mcp__[^_]+__(.+)$/);
  const baseName = mcpMatch ? mcpMatch[1] : name;
  return baseName.toLowerCase().replace(/[^a-z]/g, "");
}
```

This converts `mcp__acp__Edit` → `edit`, `mcp__acp__Write` → `write`, etc.

### Fix 2: Re-run rehydration when messages load
Updated the rehydration useEffect in `src/components/HeadlessChat/index.tsx:193-207`:
- Only skip rehydration if session was seeded AND messages exist
- Only mark session as seeded after messages have loaded

```typescript
// Only skip if we've already seeded AND we have messages
if (touchedSeededSession.current === sessionId && messages.length > 0) return;
// ...
// Only mark as seeded if we have messages
if (messages.length > 0) {
  touchedSeededSession.current = sessionId;
}
```

## Files Modified
- `src/components/HeadlessChat/index.tsx`

## Testing Verified
1. Created test session (test-10) with AI edits to 3 files
2. Reloaded the app
3. Verified diff panel shows **3 files +8 -0** with **AI SCOPE** badge
4. Verified file content is visible when expanded:
   - `convex/schema.ts` +2 -0
   - `src/App.tsx` +4 -0
   - `src/store/workspaces.ts` +2 -0

## Commit
`ea17d08` - fix(US-034): Rehydrate AI scope from Convex messages on reload
