# Side Panel Diff & E2E Comment Testing

## What was built
- US-017: Side panel diff view - terminal and diff side-by-side
- Full E2E comment workflow tested with real Claude interaction

## Implementation
Changed `App.tsx` from view mode tabs to side-by-side layout:
- Terminal always visible on left
- Diff panel slides in from right with toggle button
- CSS: `.diff-panel` is 450px wide, collapsible

## E2E Test
Tested by interacting with Claude in terminal:
1. Added comment → Claude found it via `get_pending_comments`
2. Claude replied via `reply_to_comment` → green border in UI
3. Claude resolved via `resolve_comment` → comment faded

## Fixes

### Terminal blank lines
- **Problem:** Blank lines during Claude processing
- **Fix:** `Terminal.tsx:133` - filter bare `\n`/`\r`/`\r\n`

### Comment replies not showing
- **Problem:** Replies invisible
- **Fix:** `DiffViewer.tsx` - nested reply rendering with `.diff-comment-reply`

## Learnings
- HTTP API port 19420, WebSocket 9223
- `writeLine()` needs `write('\r')` to submit
- Check workspace `origin_branch` matches repo
