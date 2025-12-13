import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get all todos for a session
export const getBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("todos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
  },
});

// Set todos for a session (replaces all existing)
export const setTodos = mutation({
  args: {
    sessionId: v.id("sessions"),
    todos: v.array(
      v.object({
        content: v.string(),
        activeForm: v.optional(v.string()),
        status: v.union(
          v.literal("pending"),
          v.literal("in_progress"),
          v.literal("completed")
        ),
        priority: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing todos
    const existing = await ctx.db
      .query("todos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const todo of existing) {
      await ctx.db.delete(todo._id);
    }

    // Insert new todos
    const insertedIds = [];
    for (const todo of args.todos) {
      const id = await ctx.db.insert("todos", {
        sessionId: args.sessionId,
        content: todo.content,
        activeForm: todo.activeForm,
        status: todo.status,
        priority: todo.priority,
      });
      insertedIds.push(id);
    }

    return insertedIds;
  },
});

// Update a single todo's status
export const updateStatus = mutation({
  args: {
    id: v.id("todos"),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
    });
  },
});

// Clear all todos for a session
export const clearSession = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const todos = await ctx.db
      .query("todos")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const todo of todos) {
      await ctx.db.delete(todo._id);
    }
  },
});
