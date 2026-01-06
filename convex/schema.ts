import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // Auth tables from @convex-dev/auth (users, sessions, accounts, etc.)
  ...authTables,

  // Extended user profile - linked to auth user
  userProfiles: defineTable({
    userId: v.id("users"), // References auth user
    linkedLocalIds: v.optional(v.array(v.string())), // For migration from anonymous
    lastSyncAt: v.optional(v.number()), // Last full sync timestamp
    preferences: v.optional(
      v.object({
        theme: v.optional(v.string()),
        defaultPermissionMode: v.optional(v.string()),
      })
    ),
  })
    .index("by_user", ["userId"])
    .index("by_linked_local", ["linkedLocalIds"]),

  // Workspaces - project folders
  workspaces: defineTable({
    userId: v.id("users"),
    localId: v.optional(v.string()), // Maps to local SQLite workspace ID
    name: v.string(),
    path: v.string(), // Local filesystem path
    originBranch: v.optional(v.string()),
    updatedAt: v.number(), // For sync conflict resolution
    deletedAt: v.optional(v.number()), // Soft delete
  })
    .index("by_user", ["userId"])
    .index("by_local_id", ["localId"]),

  // Sessions - Claude coding sessions
  sessions: defineTable({
    userId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),
    localSessionId: v.optional(v.string()), // Maps to local SQLite session ID
    name: v.string(),
    cwd: v.string(), // Working directory
    claudeSessionId: v.optional(v.string()), // Claude's internal session ID
    baseCommit: v.optional(v.string()), // Git commit SHA for diffs
    phase: v.object({
      type: v.string(), // "idle" | "running_script" | "running_claude" | "script_error"
      scriptPath: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
    isClaudeBusy: v.boolean(),
    lastActivityAt: v.number(),
    updatedAt: v.optional(v.number()), // For sync conflict resolution (optional for migration)
    deletedAt: v.optional(v.number()), // Soft delete
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_claude_session", ["claudeSessionId"])
    .index("by_local_session", ["localSessionId"]),

  // Messages - chat history
  messages: defineTable({
    sessionId: v.id("sessions"),
    externalId: v.optional(v.string()), // UUID from Claude's JSONL
    type: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("error")
    ),
    content: v.any(), // ContentBlock[] - text, tool_use, tool_result, thinking, etc.
    cost: v.optional(v.number()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    createdAt: v.optional(v.number()), // Timestamp for ordering
  })
    .index("by_session", ["sessionId"])
    .index("by_external_id", ["externalId"]),

  // Todos - task tracking from TodoWrite tool
  todos: defineTable({
    sessionId: v.id("sessions"),
    content: v.string(),
    activeForm: v.optional(v.string()), // Present tense form
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    priority: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  // Inbox messages - notifications from Claude
  inboxMessages: defineTable({
    userId: v.id("users"),
    sessionId: v.id("sessions"),
    localId: v.optional(v.string()), // Maps to local SQLite inbox message ID
    message: v.string(),
    isRead: v.boolean(),
    readAt: v.optional(v.number()),
    firstReadAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(), // For sync conflict resolution
    deletedAt: v.optional(v.number()), // Soft delete
  })
    .index("by_user", ["userId"])
    .index("by_session", ["sessionId"])
    .index("by_local_id", ["localId"]),

  // Diff comments - code review feedback
  diffComments: defineTable({
    sessionId: v.id("sessions"),
    localId: v.optional(v.string()), // Maps to local SQLite comment ID
    filePath: v.string(),
    lineNumber: v.number(),
    lineType: v.optional(v.string()), // "added" | "removed" | "context"
    side: v.union(v.literal("left"), v.literal("right")),
    author: v.optional(v.string()),
    content: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("wont_fix")
    ),
    resolvedNote: v.optional(v.string()),
    parentId: v.optional(v.id("diffComments")), // For threaded replies
    createdAt: v.number(),
    updatedAt: v.number(), // For sync conflict resolution
    deletedAt: v.optional(v.number()), // Soft delete
  })
    .index("by_session", ["sessionId"])
    .index("by_local_id", ["localId"]),
});
