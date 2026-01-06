# Comprehensive E2E Test Coverage Plan

## Status: Phase 1-3 Complete ✅

The following are already implemented:
- Vitest setup with mocks for Tauri APIs
- Unit tests for stores (settings, sessions, inbox) - 56 tests passing
- Basic E2E tests using MCP Bridge (9 tests passing)
- WebDriver tests for CI/Linux
- GitHub Actions workflow

## Current Goal: Comprehensive E2E Coverage

Expand E2E test coverage to prevent regressions across all features.

## Test Infrastructure (Already in Place)

| Component | Location | Purpose |
|-----------|----------|---------|
| MCP Bridge Client | `e2e/tauri-e2e.test.ts` | WebSocket automation via port 9223 |
| Database Access | `better-sqlite3` | Direct SQLite verification |
| WebDriver Tests | `e2e/webdriver.test.ts` | CI/Linux execution |

### MCP Bridge Protocol
```typescript
// Send: { command, id, args }
// Receive: { data, success, id }
client.send('execute_js', { script: '...' })
client.send('find_element', { selector: '...', strategy: 'css' })
client.send('click', { selector: '...' })
client.send('type', { selector: '...', text: '...' })
```

## Feature Test Matrix

| Feature | Priority | Current Tests | Needed Tests |
|---------|----------|---------------|--------------|
| Sidebar Navigation | High | 2 | 8 |
| Session Management | High | 3 | 10 |
| HeadlessChat | High | 0 | 8 |
| Permission Dialog | High | 1 | 6 |
| DiffViewer | High | 0 | 12 |
| Comments | High | 0 | 8 |
| Inbox | Medium | 1 | 6 |
| Settings | Medium | 2 | 5 |
| Workspace Setup | Medium | 0 | 6 |
| Terminal | Low | 0 | 4 |
| Session Recovery | High | 0 | 5 |

## Implementation Plan

### File Structure
```
e2e/
├── helpers/
│   ├── bridge-client.ts      # Extract BridgeClient class (refactor)
│   ├── database.ts           # SQLite helpers
│   └── test-utils.ts         # Common test utilities
├── specs/
│   ├── sidebar.spec.ts
│   ├── session.spec.ts
│   ├── headless-chat.spec.ts
│   ├── permission-dialog.spec.ts
│   ├── diff-viewer.spec.ts
│   ├── comments.spec.ts
│   ├── inbox.spec.ts
│   ├── settings.spec.ts
│   ├── workspace.spec.ts
│   └── session-recovery.spec.ts
└── vitest.config.ts
```

### Phase 1: Refactor Test Infrastructure

1. **Extract BridgeClient to `e2e/helpers/bridge-client.ts`**
   - Reusable WebSocket client class
   - Add convenience methods: `click()`, `type()`, `getText()`, `exists()`

2. **Create `e2e/helpers/database.ts`**
   - `getSession(id)`, `getSessions()`, `getWorkspaces()`
   - `getInboxMessages()`, `getDiffComments()`
   - `clearTestData()` for cleanup

3. **Create `e2e/helpers/test-utils.ts`**
   - `waitFor(condition, timeout)` - poll until true
   - `waitForElement(selector)` - wait for DOM element
   - `waitForText(text)` - wait for text content

### Phase 2: Core Feature Tests

#### 2.1 Sidebar Tests (`sidebar.spec.ts`)
```typescript
// Tests to write:
- Session list displays all sessions
- Click session switches active session
- Session badges show unread count
- Workspace filter shows only workspace sessions
- New session button creates session
- Session context menu (rename, delete)
- Collapse/expand sidebar
- Keyboard navigation (up/down arrows)
```

#### 2.2 Session Management Tests (`session.spec.ts`)
```typescript
// Tests to write:
- Create new session with default name
- Rename session via sidebar
- Delete session with confirmation
- Switch between sessions preserves state
- Session persists to database
- Session loads messages on switch
- Session git info displays correctly
- Base commit updates on sync
- Dirty files indicator shows
- Multiple sessions can be open
```

#### 2.3 HeadlessChat Tests (`headless-chat.spec.ts`)
```typescript
// Tests to write:
- Message input accepts text
- Submit message adds to chat
- AI response displays in chat
- Message history scrolls correctly
- Code blocks render with syntax highlighting
- Copy button on code blocks works
- Markdown renders correctly
- Loading indicator during AI response
```

#### 2.4 Permission Dialog Tests (`permission-dialog.spec.ts`)
```typescript
// Tests to write:
- Dialog appears for tool requiring permission
- 'y' key allows tool
- 'n' key denies tool
- 'a' key always allows tool
- Escape closes dialog
- Dialog shows tool name and args
- Multiple permissions queue correctly
```

### Phase 3: Advanced Feature Tests

#### 3.1 DiffViewer Tests (`diff-viewer.spec.ts`)
```typescript
// Tests to write:
- Diff panel shows when diffs exist
- File list displays changed files
- Click file expands diff content
- Added lines show green
- Removed lines show red
- Hunk headers display correctly
- Collapse/expand individual hunks
- "Accept All" applies all changes
- "Reject All" reverts all changes
- Individual hunk accept/reject
- Diff updates when scope changes
- Empty state when no diffs
```

#### 3.2 Comments Tests (`comments.spec.ts`)
```typescript
// Tests to write:
- Add comment on diff line
- Comment badge shows count
- Click badge opens comment thread
- Reply to existing comment
- Resolve comment removes from view
- Unresolved comments persist
- Comment persists to database
- MCP get_pending_comments returns comments
```

#### 3.3 Inbox Tests (`inbox.spec.ts`)
```typescript
// Tests to write:
- Inbox shows notify_ready messages
- Click message selects it
- Mark message as read
- Delete message removes from list
- Inbox count updates in sidebar
- Messages persist to database
```

#### 3.4 Settings Tests (`settings.spec.ts`)
```typescript
// Tests to write:
- Open settings modal
- Toggle dark mode
- Change default permission mode
- Save settings persists to store
- Settings load on app start
```

### Phase 4: Integration Tests

#### 4.1 Workspace Setup Tests (`workspace.spec.ts`)
```typescript
// Tests to write:
- Workspace modal appears for new workspace
- Git repo detected automatically
- Script selection works
- Workspace saves to database
- Workspace appears in sidebar filter
- Edit workspace settings
```

#### 4.2 Session Recovery Tests (`session-recovery.spec.ts`)
```typescript
// Tests to write:
- Close and reopen app restores sessions
- Active session restored correctly
- Messages rehydrated from database
- Scroll position preserved
- Pending permissions restored
- AI scope restored from messages
```

## Test Data Setup

Each test file should:
1. Clear relevant test data before each test
2. Create minimal required fixtures
3. Clean up after test completion

```typescript
beforeEach(async () => {
  await db.clearTestData();
  await client.connect();
});

afterEach(async () => {
  await client.disconnect();
});
```

## Key Selectors (data-testid)

Add these to components if missing:
- `[data-testid="sidebar"]`
- `[data-testid="session-list"]`
- `[data-testid="session-item-{id}"]`
- `[data-testid="new-session-btn"]`
- `[data-testid="chat-input"]`
- `[data-testid="chat-messages"]`
- `[data-testid="permission-dialog"]`
- `[data-testid="diff-viewer"]`
- `[data-testid="file-list"]`
- `[data-testid="inbox-panel"]`
- `[data-testid="settings-modal"]`

## Implementation Order

1. **Phase 1: Infrastructure** (1 file)
   - Refactor BridgeClient, create helpers

2. **Phase 2: High Priority** (4 files, ~30 tests)
   - sidebar.spec.ts
   - session.spec.ts
   - headless-chat.spec.ts
   - permission-dialog.spec.ts

3. **Phase 3: Medium Priority** (4 files, ~30 tests)
   - diff-viewer.spec.ts
   - comments.spec.ts
   - inbox.spec.ts
   - settings.spec.ts

4. **Phase 4: Lower Priority** (2 files, ~10 tests)
   - workspace.spec.ts
   - session-recovery.spec.ts

## Files to Modify

- `e2e/tauri-e2e.test.ts` - Extract BridgeClient class
- `src/components/*.tsx` - Add data-testid attributes as needed

## Files to Create

- `e2e/helpers/bridge-client.ts`
- `e2e/helpers/database.ts`
- `e2e/helpers/test-utils.ts`
- `e2e/specs/sidebar.spec.ts`
- `e2e/specs/session.spec.ts`
- `e2e/specs/headless-chat.spec.ts`
- `e2e/specs/permission-dialog.spec.ts`
- `e2e/specs/diff-viewer.spec.ts`
- `e2e/specs/comments.spec.ts`
- `e2e/specs/inbox.spec.ts`
- `e2e/specs/settings.spec.ts`
- `e2e/specs/workspace.spec.ts`
- `e2e/specs/session-recovery.spec.ts`

## Success Criteria

- Total E2E tests: 70+ (up from 9)
- All critical user flows covered
- Tests run in < 5 minutes total
- Tests are reliable (no flaky tests)
- CI/CD integration working
