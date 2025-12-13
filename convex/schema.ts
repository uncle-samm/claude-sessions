import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Users table - for authentication
  users: defineTable({
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
    tokenIdentifier: v.string(), // From auth provider (Clerk/Convex Auth)
  }).index("by_token", ["tokenIdentifier"]),

  // Workspaces - project folders
  workspaces: defineTable({
    userId: v.id("users"),
    name: v.string(),
    path: v.string(), // Local filesystem path
  }).index("by_user", ["userId"]),

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
    message: v.string(),
    isRead: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["sessionId"]),

  // Diff comments - code review feedback
  diffComments: defineTable({
    sessionId: v.id("sessions"),
    filePath: v.string(),
    lineNumber: v.number(),
    side: v.union(v.literal("left"), v.literal("right")),
    content: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("wont_fix")
    ),
    resolvedNote: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),
});
