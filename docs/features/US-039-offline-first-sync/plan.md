# Offline-First Architecture with Optional Convex Sync

## Summary

Enable the app to work fully offline (SQLite) with optional OAuth sign-in that syncs all data to Convex for multi-device access.

## Requirements

1. **Offline-first**: Works fully without login, all data in SQLite
2. **Optional OAuth**: Google + GitHub via @convex-dev/auth
3. **Full sync when signed in**: Sessions, messages, workspaces, inbox, comments
4. **Resilient**: Queue changes offline, sync when connection restored
5. **Merge on first sync**: Combine local + cloud, last-modified-wins for conflicts

## Current State

| Layer | Storage | Status |
|-------|---------|--------|
| Local (SQLite) | sessions, workspaces, inbox, comments | ✅ Working |
| Cloud (Convex) | users, sessions, messages, todos | ⚠️ Partial |
| Auth | Anonymous localStorage ID only | ⚠️ No OAuth |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React UI                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
         ┌──────────────────┐    ┌──────────────────┐
         │  Zustand Stores  │    │   SyncService    │
         │  (+ middleware)  │───▶│  - offline queue │
         └────────┬─────────┘    │  - push/pull     │
                  │              │  - conflict res. │
                  ▼              └────────┬─────────┘
         ┌──────────────────┐             │
         │  SQLite (Tauri)  │◀────────────┘
         │  Source of Truth │             │
         └──────────────────┘             │
                                          ▼ (when online + authenticated)
                              ┌──────────────────┐
                              │   Convex Cloud   │
                              │  (with OAuth)    │
                              └──────────────────┘
```

**Key Principle**: SQLite is always the source of truth. Convex is a sync target.

---

## Phase 1: Auth Foundation

### 1.1 Install @convex-dev/auth

```bash
npm install @convex-dev/auth @auth/core
```

### 1.2 Create Auth Config

**Create: `convex/auth.config.ts`**
```typescript
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [GitHub, Google],
});
```

### 1.3 Update Convex Schema

**Modify: `convex/schema.ts`**
- Add auth tables from @convex-dev/auth
- Add `linkedLocalIds` to users for migration
- Add `updatedAt` to all tables for conflict resolution

### 1.4 Auth UI in Settings

**Create: `src/components/AuthSection.tsx`**
- Sign in with Google/GitHub buttons (when not signed in)
- User avatar + name + Sign Out (when signed in)
- Sync status indicator

**Modify: `src/components/SettingsPanel.tsx`**
- Add AuthSection component

### 1.5 Update Providers

**Modify: `src/main.tsx`**
- Wrap with `ConvexAuthProvider` from @convex-dev/auth
- Keep existing `ConvexProvider` pattern

**Modify: `src/hooks/useConvexUser.tsx`**
- Detect authenticated vs anonymous state
- Support both modes seamlessly

### Files for Phase 1
| File | Action |
|------|--------|
| `convex/auth.config.ts` | Create |
| `convex/auth.ts` | Create |
| `convex/schema.ts` | Modify |
| `src/components/AuthSection.tsx` | Create |
| `src/components/SettingsPanel.tsx` | Modify |
| `src/main.tsx` | Modify |
| `src/hooks/useAuth.tsx` | Create |

---

## Phase 2: Sync Infrastructure

### 2.1 Add Sync Columns to SQLite

**Modify: `src-tauri/src/db.rs`**

Add to all tables:
```sql
ALTER TABLE sessions ADD COLUMN convex_id TEXT;
ALTER TABLE sessions ADD COLUMN sync_status TEXT DEFAULT 'pending';
ALTER TABLE sessions ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sessions ADD COLUMN deleted_at TEXT;
```

Add sync queue table:
```sql
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

### 2.2 Create SyncService

**Create: `src/services/SyncService.ts`**

Core responsibilities:
- Queue mutations when offline
- Process queue when online
- Push local changes to Convex
- Pull remote changes to SQLite
- Conflict resolution (last-modified-wins)

```typescript
class SyncService {
  async queueMutation(entityType, entityId, operation, payload): Promise<void>
  async processQueue(): Promise<void>
  async pullChanges(userId, lastSyncAt): Promise<void>
  async fullSync(): Promise<void>
}
```

### 2.3 Zustand Sync Middleware

**Create: `src/store/syncMiddleware.ts`**

Intercept store mutations and queue for sync:
```typescript
const syncMiddleware = (config, f) => (set, get, api) => {
  const syncSet = (partial, replace) => {
    set(partial, replace);
    if (isAuthenticated()) {
      queueChangesForSync(config, prev, next);
    }
  };
  return f(syncSet, get, api);
};
```

### 2.4 Convex Sync Functions

**Create: `convex/sync.ts`**
- `getChangesSince(userId, timestamp)` - Delta sync
- `pushChanges(userId, changes)` - Batch upload
- `getFullState(userId)` - Initial sync

### Files for Phase 2
| File | Action |
|------|--------|
| `src-tauri/src/db.rs` | Modify |
| `src/services/SyncService.ts` | Create |
| `src/services/SyncContext.tsx` | Create |
| `src/store/syncMiddleware.ts` | Create |
| `convex/sync.ts` | Create |

---

## Phase 3: Entity Sync

### 3.1 Schema Mapping

**Create: `src/services/schemaMapping.ts`**

Map between SQLite and Convex schemas:
```typescript
function sessionToConvex(local: LocalSession): ConvexSession
function sessionFromConvex(remote: ConvexSession): LocalSession
// Similar for workspaces, inbox, comments
```

### 3.2 Implement Per-Entity Sync

For each entity type:
1. **Sessions** - Full bidirectional sync
2. **Workspaces** - Full bidirectional sync
3. **Messages** - Append-only (no conflicts, match by externalId)
4. **Inbox** - Full bidirectional sync
5. **Comments** - Full bidirectional sync

### 3.3 Soft Deletes

All deletes set `deleted_at` instead of hard delete, allowing sync to propagate.

### Files for Phase 3
| File | Action |
|------|--------|
| `src/services/schemaMapping.ts` | Create |
| `src/services/SyncService.ts` | Modify (add entity handlers) |
| `convex/sessions.ts` | Modify (add sync support) |
| `convex/workspaces.ts` | Create |
| `convex/messages.ts` | Modify (add bulkImport) |

---

## Phase 4: First-Time Sync & Migration

### 4.1 Account Linking

When user signs in for first time:
1. Link their localStorage `localId` to authenticated user
2. Check for existing cloud data
3. If no cloud data → push all local to cloud
4. If cloud data exists → merge with local

### 4.2 Merge Strategy

```
For each entity type:
  1. Match by unique key (name+cwd for sessions, path for workspaces)
  2. If matched → last-modified-wins
  3. If local-only → push to cloud
  4. If cloud-only → pull to local
```

### 4.3 Sync Status UI

**Create: `src/components/SyncStatus.tsx`**

States: `synced` | `syncing` | `offline` | `error`

Show:
- Last sync timestamp
- Pending changes count (when offline)
- Error message (when failed)

### Files for Phase 4
| File | Action |
|------|--------|
| `src/services/SyncService.ts` | Modify (add merge logic) |
| `src/components/SyncStatus.tsx` | Create |
| `convex/users.ts` | Modify (add linkLocalId) |

---

## Implementation Order

| Step | Description | Deliverable |
|------|-------------|-------------|
| 1 | Install @convex-dev/auth, create auth config | OAuth working |
| 2 | Add auth UI to settings panel | Users can sign in |
| 3 | Add sync columns to SQLite | Schema ready |
| 4 | Create SyncService + queue | Offline queue working |
| 5 | Implement session sync | Sessions sync bidirectionally |
| 6 | Implement remaining entities | Full sync working |
| 7 | Add merge logic for first-time sync | Migration complete |
| 8 | Add sync status UI | User visibility |

---

## Critical Files

| File | Purpose |
|------|---------|
| `src-tauri/src/db.rs` | SQLite schema + sync queue |
| `convex/schema.ts` | Cloud schema with auth |
| `convex/auth.config.ts` | OAuth provider config |
| `src/services/SyncService.ts` | Core sync logic |
| `src/hooks/useAuth.tsx` | Auth state management |
| `src/main.tsx` | Provider setup |

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during sync | Soft deletes, 30-day audit log |
| Large offline queue | Compress consecutive updates |
| Network flapping | Debounce state changes (2s) |
| Schema migration | Version sync protocol |
| Token expiry | @convex-dev/auth handles refresh |

---

## Success Criteria

- [ ] App works fully offline (no login required)
- [ ] OAuth sign-in with Google and GitHub
- [ ] All data syncs when signed in
- [ ] Offline changes queue and sync when back online
- [ ] First-time sync merges local + cloud correctly
- [ ] Sync status visible to user
