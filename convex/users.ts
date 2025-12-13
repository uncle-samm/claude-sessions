import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Get user by token identifier (from auth provider)
export const getByToken = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .first();
  },
});

// Get user by ID
export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Create or update user (upsert on login)
export const upsert = mutation({
  args: {
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .first();

    if (existing) {
      // Update existing user
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        imageUrl: args.imageUrl,
      });
      return existing._id;
    }

    // Create new user
    return await ctx.db.insert("users", {
      tokenIdentifier: args.tokenIdentifier,
      name: args.name,
      email: args.email,
      imageUrl: args.imageUrl,
    });
  },
});

// For development/testing: create anonymous user
export const createAnonymous = mutation({
  args: {},
  handler: async (ctx) => {
    const anonId = `anon_${Date.now()}`;
    return await ctx.db.insert("users", {
      tokenIdentifier: anonId,
      name: "Anonymous User",
      email: `${anonId}@local`,
    });
  },
});

// Get or create anonymous user for local development
export const getOrCreateAnonymous = mutation({
  args: { localId: v.string() },
  handler: async (ctx, args) => {
    const tokenId = `local_${args.localId}`;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: tokenId,
      name: "Local User",
      email: `${args.localId}@local`,
    });
  },
});
