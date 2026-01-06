import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Get the current authenticated user
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});

// Get user by ID
export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Get user profile (extended data beyond auth)
export const getProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// Get or create user profile for current user
export const getOrCreateProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      return existing;
    }

    // Create new profile
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      linkedLocalIds: [],
    });

    return await ctx.db.get(profileId);
  },
});

// Link a local ID to the current user (for migration from anonymous)
export const linkLocalId = mutation({
  args: { localId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      const linkedLocalIds = profile.linkedLocalIds || [];
      if (!linkedLocalIds.includes(args.localId)) {
        await ctx.db.patch(profile._id, {
          linkedLocalIds: [...linkedLocalIds, args.localId],
        });
      }
    } else {
      await ctx.db.insert("userProfiles", {
        userId,
        linkedLocalIds: [args.localId],
      });
    }
  },
});

// Update last sync timestamp
export const updateLastSync = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (profile) {
      await ctx.db.patch(profile._id, {
        lastSyncAt: Date.now(),
      });
    }
  },
});

// Get user by linked local ID (for finding if anonymous data was already linked)
export const getByLinkedLocalId = query({
  args: { localId: v.string() },
  handler: async (ctx, args) => {
    // Note: This is a scan since we can't index into arrays directly
    // For production, consider a separate linking table
    const profiles = await ctx.db.query("userProfiles").collect();
    const profile = profiles.find((p) =>
      p.linkedLocalIds?.includes(args.localId)
    );
    if (!profile) return null;
    return await ctx.db.get(profile.userId);
  },
});

// For development/testing: create anonymous user (kept for backwards compatibility)
export const getOrCreateAnonymous = mutation({
  args: { localId: v.string() },
  handler: async (ctx, args) => {
    // Check if there's already a user linked to this local ID
    const profiles = await ctx.db.query("userProfiles").collect();
    const existingProfile = profiles.find((p) =>
      p.linkedLocalIds?.includes(args.localId)
    );

    if (existingProfile) {
      return existingProfile.userId;
    }

    // For anonymous mode, we don't create a real user
    // Return null to indicate anonymous mode
    return null;
  },
});
