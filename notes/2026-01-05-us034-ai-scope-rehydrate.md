# US-034: AI Scope Rehydrate

## What was built
Fixed AI-touched file scope rehydration from Convex messages after app reload.

## Fixes made
1. **MCP tool name extraction** (`src/components/HeadlessChat/index.tsx:74-81`)
   - Added `extractBaseToolName()` function
   - Converts `mcp__acp__Edit` → `edit`, `mcp__acp__Write` → `write`
   - Pattern: `/^mcp__[^_]+__(.+)$/`

2. **Rehydration timing fix** (`src/components/HeadlessChat/index.tsx:193-210`)
   - Problem: useEffect ran before Convex messages loaded, then never re-ran
   - Fix: Only mark session as seeded AFTER messages have loaded
   - Condition changed from: `if (touchedSeededSession.current === sessionId) return`
   - To: `if (touchedSeededSession.current === sessionId && messages.length > 0) return`

## Commit
`ea17d08` - fix(US-034): Rehydrate AI scope from Convex messages on reload
