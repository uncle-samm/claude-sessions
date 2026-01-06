import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all sessions for a user
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

// Get all sessions for a workspace
export const getByWorkspace = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});

// Get a single session by ID
export const get = query({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get session by Claude session ID
export const getByClaudeSessionId = query({
  args: { claudeSessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_claude_session", (q) => q.eq("claudeSessionId", args.claudeSessionId))
      .first();
  },
});

// Get session by local session ID (maps to SQLite session)
export const getByLocalSessionId = query({
  args: { localSessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_local_session", (q) => q.eq("localSessionId", args.localSessionId))
      .first();
  },
});

// Create a new session
export const create = mutation({
  args: {
    userId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),
    localSessionId: v.optional(v.string()),
    name: v.string(),
    cwd: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("sessions", {
      userId: args.userId,
      workspaceId: args.workspaceId,
      localSessionId: args.localSessionId,
      name: args.name,
      cwd: args.cwd,
      phase: { type: "idle" },
      isClaudeBusy: false,
      lastActivityAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

// Get or create a session for a local session ID
export const getOrCreateForLocal = mutation({
  args: {
    userId: v.id("users"),
    localSessionId: v.string(),
    name: v.string(),
    cwd: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if session already exists
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_local_session", (q) => q.eq("localSessionId", args.localSessionId))
      .first();

    if (existing) {
      return existing._id;
    }

    // Create new session
    const now = Date.now();
    return await ctx.db.insert("sessions", {
      userId: args.userId,
      localSessionId: args.localSessionId,
      name: args.name,
      cwd: args.cwd,
      phase: { type: "idle" },
      isClaudeBusy: false,
      lastActivityAt: now,
      updatedAt: now,
    });
  },
});

// Update session phase
export const updatePhase = mutation({
  args: {
    id: v.id("sessions"),
    phase: v.object({
      type: v.string(),
      scriptPath: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      phase: args.phase,
      lastActivityAt: Date.now(),
    });
  },
});

// Update Claude session ID (for session persistence)
export const updateClaudeSessionId = mutation({
  args: {
    id: v.id("sessions"),
    claudeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      claudeSessionId: args.claudeSessionId,
    });
  },
});

// Update base commit for diffs
export const updateBaseCommit = mutation({
  args: {
    id: v.id("sessions"),
    baseCommit: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      baseCommit: args.baseCommit,
    });
  },
});

// Set Claude busy state
export const setClaudeBusy = mutation({
  args: {
    id: v.id("sessions"),
    isClaudeBusy: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isClaudeBusy: args.isClaudeBusy,
      lastActivityAt: Date.now(),
    });
  },
});

// Update activity timestamp
export const updateActivity = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastActivityAt: Date.now(),
    });
  },
});

// Delete a session (and its messages, todos)
export const remove = mutation({
  args: { id: v.id("sessions") },
  handler: async (ctx, args) => {
    // Delete related messages
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // Delete related todos
    const todos = await ctx.db
      .query("todos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const todo of todos) {
      await ctx.db.delete(todo._id);
    }

    // Delete related inbox messages
    const inbox = await ctx.db
      .query("inboxMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const msg of inbox) {
      await ctx.db.delete(msg._id);
    }

    // Delete related comments
    const comments = await ctx.db
      .query("diffComments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.id))
      .collect();
    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    // Delete the session
    await ctx.db.delete(args.id);
  },
});

// Rename a session
export const rename = mutation({
  args: {
    id: v.id("sessions"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      name: args.name,
    });
  },
});
