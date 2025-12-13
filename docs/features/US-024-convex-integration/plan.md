# Plan: Convex Backend Integration (US-024)

## Overview
Migrate from local SQLite storage to Convex for real-time sync, cloud persistence, and user authentication. This enables multi-device support and fixes real-time message updates.

## Why Convex?
- **Real-time by default**: Built-in reactivity, no manual event handling
- **Cloud persistence**: Sessions accessible from any device
- **Auth integration**: Easy to add Clerk or Convex Auth
- **TypeScript-first**: Full type safety from DB to frontend
- **Free tier**: Generous limits for personal projects

## Architecture

### Current (Local)
```
Tauri App → SQLite (local) → Zustand stores
         → Claude JSONL files (read-only)
```

### New (Convex)
```
Tauri App → Convex (cloud) → Real-time subscriptions
         → Claude JSONL files (read for history import)
         → Auth provider (Clerk/Convex Auth)
```

## Schema Design

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    tokenIdentifier: v.string(), // From auth provider
  }).index("by_token", ["tokenIdentifier"]),

  workspaces: defineTable({
    userId: v.id("users"),
    name: v.string(),
    path: v.string(),
  }).index("by_user", ["userId"]),

  sessions: defineTable({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    name: v.string(),
    cwd: v.string(),
    claudeSessionId: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    phase: v.object({
      type: v.string(),
      scriptPath: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
    isClaudeBusy: v.boolean(),
    lastActivityAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    type: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.any(), // ContentBlock[]
    cost: v.optional(v.number()),
    timestamp: v.number(),
  }).index("by_session", ["sessionId"]),

  todos: defineTable({
    sessionId: v.id("sessions"),
    content: v.string(),
    status: v.union(v.literal("pending"), v.literal("in_progress"), v.literal("completed")),
    priority: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),
});
```

## Implementation Steps

### Phase 1: Convex Setup
1. Install Convex: `npm install convex`
2. Initialize: `npx convex dev` (creates convex/ folder)
3. Create schema.ts with tables above
4. Wrap app with ConvexProvider in main.tsx

### Phase 2: Authentication
1. Set up Clerk or Convex Auth
2. Add sign in/sign out UI
3. Create user on first sign in
4. Gate workspace/session access by userId

### Phase 3: Session Migration
1. Create Convex functions for sessions CRUD
2. Replace Zustand session store with Convex queries
3. Update Sidebar to use `useQuery` for sessions list
4. Migrate createSession, deleteSession to Convex mutations

### Phase 4: Message Storage
1. Create Convex functions for messages
2. When Claude sends message → save to Convex
3. HeadlessChat subscribes to messages with `useQuery`
4. Real-time updates happen automatically

### Phase 5: Claude Integration
1. Keep Tauri backend for spawning Claude process
2. Tauri emits events → React calls Convex mutation
3. Convex mutation saves message → all subscribers update
4. Optional: Import existing JSONL history to Convex

## Code Changes

### src/main.tsx
```tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

<ConvexProvider client={convex}>
  <ClerkProvider> {/* or Convex Auth */}
    <App />
  </ClerkProvider>
</ConvexProvider>
```

### src/components/HeadlessChat/index.tsx
```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

// Replace zustand with Convex
const messages = useQuery(api.messages.getBySession, { sessionId });
const addMessage = useMutation(api.messages.create);

// When Claude responds, save to Convex
const handleClaudeMessage = (event) => {
  if (message.type === "assistant") {
    addMessage({
      sessionId,
      type: "assistant",
      content: message.message.content,
      timestamp: Date.now(),
    });
  }
};
```

## Environment Variables
```
VITE_CONVEX_URL=https://your-project.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_... (if using Clerk)
```

## Migration Strategy
1. Keep SQLite as fallback for offline mode
2. Add "Sync to cloud" button for existing local sessions
3. New sessions created in Convex by default
4. Read-only access to Claude's JSONL for history import

## Testing Plan
1. Create new session → verify in Convex dashboard
2. Send message → verify real-time update (no reload)
3. Open same session in new tab → verify sync
4. Sign out/in → verify sessions persist
5. Test offline behavior (graceful degradation)

## Risks & Mitigations
- **Offline mode**: Keep SQLite fallback, sync when online
- **Latency**: Convex is fast, but add optimistic updates
- **Vendor lock-in**: Schema is portable, can self-host Convex
- **Cost**: Free tier is generous, monitor usage
