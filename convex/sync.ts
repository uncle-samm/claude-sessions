import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// Get all changes since a given timestamp for the authenticated user
export const getChangesSince = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { sessions: [], workspaces: [], inboxMessages: [], diffComments: [] };
    }

    // Get sessions updated since timestamp
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gte(q.field("updatedAt"), args.since))
      .collect();

    // Get workspaces updated since timestamp
    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.gte(q.field("updatedAt"), args.since))
      .collect();

    // Get inbox messages from user's sessions
    const sessionIds = sessions.map((s) => s._id);
    const allInboxMessages = await ctx.db.query("inboxMessages").collect();
    const inboxMessages = allInboxMessages.filter(
      (m) =>
        sessionIds.some((sid) => sid === m.sessionId) &&
        (m.updatedAt ?? m._creationTime) >= args.since
    );

    // Get diff comments from user's sessions
    const allComments = await ctx.db.query("diffComments").collect();
    const diffComments = allComments.filter(
      (c) =>
        sessionIds.some((sid) => sid === c.sessionId) &&
        (c.updatedAt ?? c._creationTime) >= args.since
    );

    return { sessions, workspaces, inboxMessages, diffComments };
  },
});

// Bulk push changes from local to cloud
export const pushChanges = mutation({
  args: {
    sessions: v.optional(
      v.array(
        v.object({
          localId: v.string(),
          name: v.string(),
          cwd: v.string(),
          workspaceLocalId: v.optional(v.string()),
          baseCommit: v.optional(v.string()),
          updatedAt: v.number(),
          deletedAt: v.optional(v.number()),
        })
      )
    ),
    workspaces: v.optional(
      v.array(
        v.object({
          localId: v.string(),
          name: v.string(),
          path: v.string(), // folder path
          originBranch: v.string(),
          updatedAt: v.number(),
          deletedAt: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const results = {
      sessions: [] as { localId: string; convexId: string }[],
      workspaces: [] as { localId: string; convexId: string }[],
    };

    // Process workspaces first (sessions may reference them)
    if (args.workspaces) {
      for (const workspace of args.workspaces) {
        // Check if workspace already exists by local ID
        const existing = await ctx.db
          .query("workspaces")
          .withIndex("by_local_id", (q) => q.eq("localId", workspace.localId))
          .first();

        if (existing) {
          // Update if local is newer
          if (workspace.updatedAt > (existing.updatedAt ?? 0)) {
            await ctx.db.patch(existing._id, {
              name: workspace.name,
              path: workspace.path,
              originBranch: workspace.originBranch,
              updatedAt: workspace.updatedAt,
              deletedAt: workspace.deletedAt,
            });
          }
          results.workspaces.push({
            localId: workspace.localId,
            convexId: existing._id,
          });
        } else if (!workspace.deletedAt) {
          // Create new workspace
          const id = await ctx.db.insert("workspaces", {
            userId,
            localId: workspace.localId,
            name: workspace.name,
            path: workspace.path,
            originBranch: workspace.originBranch,
            updatedAt: workspace.updatedAt,
          });
          results.workspaces.push({
            localId: workspace.localId,
            convexId: id,
          });
        }
      }
    }

    // Process sessions
    if (args.sessions) {
      for (const session of args.sessions) {
        // Check if session already exists by local ID
        const existing = await ctx.db
          .query("sessions")
          .withIndex("by_local_session", (q) =>
            q.eq("localSessionId", session.localId)
          )
          .first();

        // Find workspace ID if provided
        let workspaceId = undefined;
        if (session.workspaceLocalId) {
          const workspace = await ctx.db
            .query("workspaces")
            .withIndex("by_local_id", (q) =>
              q.eq("localId", session.workspaceLocalId)
            )
            .first();
          if (workspace) {
            workspaceId = workspace._id;
          }
        }

        if (existing) {
          // Update if local is newer
          if (session.updatedAt > (existing.updatedAt ?? 0)) {
            await ctx.db.patch(existing._id, {
              name: session.name,
              cwd: session.cwd,
              workspaceId,
              baseCommit: session.baseCommit,
              updatedAt: session.updatedAt,
              deletedAt: session.deletedAt,
            });
          }
          results.sessions.push({
            localId: session.localId,
            convexId: existing._id,
          });
        } else if (!session.deletedAt) {
          // Create new session
          const id = await ctx.db.insert("sessions", {
            userId,
            localSessionId: session.localId,
            name: session.name,
            cwd: session.cwd,
            workspaceId,
            baseCommit: session.baseCommit,
            phase: { type: "idle" },
            isClaudeBusy: false,
            lastActivityAt: Date.now(),
            updatedAt: session.updatedAt,
          });
          results.sessions.push({
            localId: session.localId,
            convexId: id,
          });
        }
      }
    }

    return results;
  },
});

// Get full state for initial sync
export const getFullState = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { sessions: [], workspaces: [], inboxMessages: [], diffComments: [] };
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get inbox messages for user's sessions
    const sessionIds = sessions.map((s) => s._id);
    const allInboxMessages = await ctx.db.query("inboxMessages").collect();
    const inboxMessages = allInboxMessages.filter((m) =>
      sessionIds.some((sid) => sid === m.sessionId)
    );

    // Get diff comments for user's sessions
    const allComments = await ctx.db.query("diffComments").collect();
    const diffComments = allComments.filter((c) =>
      sessionIds.some((sid) => sid === c.sessionId)
    );

    return { sessions, workspaces, inboxMessages, diffComments };
  },
});
