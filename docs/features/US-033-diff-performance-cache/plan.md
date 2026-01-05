# Plan

1. Audit diff store behavior and current clear/reload lifecycle.
2. Add cache keyed by session + baseRef for summary and file hunks.
3. Update DiffViewer to reuse cached data and avoid clearing on close.
4. Add lazy file list rendering (Load more or incremental render threshold).
5. Validate via MCP that reopen is instant and large lists render progressively.
