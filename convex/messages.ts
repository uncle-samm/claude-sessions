import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all messages for a session (real-time subscription)
export const getBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

// Get a single message
export const get = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Check if message with external ID already exists (for deduplication)
export const getByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .first();
  },
});

// Add a user message
export const addUserMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    content: v.string(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      externalId: args.externalId,
      type: "user",
      content: [{ type: "text", text: args.content }],
    });

    // Update session activity
    await ctx.db.patch(args.sessionId, {
      lastActivityAt: Date.now(),
    });

    return messageId;
  },
});

// Add an assistant message (from Claude)
export const addAssistantMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    content: v.any(), // ContentBlock[]
    cost: v.optional(v.number()),
    model: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check for duplicate (same externalId)
    if (args.externalId) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
        .first();
      if (existing) {
        // Update existing message instead of creating duplicate
        await ctx.db.patch(existing._id, {
          content: args.content,
          cost: args.cost,
          model: args.model,
        });
        return existing._id;
      }
    }

    const messageId = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      externalId: args.externalId,
      type: "assistant",
      content: args.content,
      cost: args.cost,
      model: args.model,
    });

    // Update session activity
    await ctx.db.patch(args.sessionId, {
      lastActivityAt: Date.now(),
    });

    return messageId;
  },
});

// Add a system message
export const addSystemMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      type: "system",
      content: [{ type: "text", text: args.content }],
    });
  },
});

// Add an error message
export const addErrorMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      type: "error",
      content: [{ type: "text", text: args.content }],
    });
  },
});

// Clear all messages for a session
export const clearSession = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
  },
});

// Bulk import messages (for migrating from JSONL history)
export const bulkImport = mutation({
  args: {
    sessionId: v.id("sessions"),
    messages: v.array(
      v.object({
        externalId: v.optional(v.string()),
        type: v.union(
          v.literal("user"),
          v.literal("assistant"),
          v.literal("system"),
          v.literal("error")
        ),
        content: v.any(),
        cost: v.optional(v.number()),
        model: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const insertedIds = [];
    for (const msg of args.messages) {
      // Skip if already exists
      if (msg.externalId) {
        const existing = await ctx.db
          .query("messages")
          .withIndex("by_external_id", (q) => q.eq("externalId", msg.externalId))
          .first();
        if (existing) {
          insertedIds.push(existing._id);
          continue;
        }
      }

      const id = await ctx.db.insert("messages", {
        sessionId: args.sessionId,
        externalId: msg.externalId,
        type: msg.type,
        content: msg.content,
        cost: msg.cost,
        model: msg.model,
      });
      insertedIds.push(id);
    }
    return insertedIds;
  },
});
