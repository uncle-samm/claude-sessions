import { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { invoke } from "@tauri-apps/api/core";

export type EntityType = "session" | "workspace" | "inbox" | "comment";
export type SyncOperation = "create" | "update" | "delete";
export type SyncStatus = "idle" | "syncing" | "error" | "offline";

export interface SyncQueueItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  operation: SyncOperation;
  payload: string; // JSON
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  pendingCount: number;
  error: string | null;
}

type SyncListener = (state: SyncState) => void;

export class SyncService {
  private convex: ConvexReactClient | null = null;
  private userId: Id<"users"> | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private listeners: Set<SyncListener> = new Set();
  private state: SyncState = {
    status: "idle",
    lastSyncAt: null,
    pendingCount: 0,
    error: null,
  };

  constructor() {
    this.setupNetworkListeners();
  }

  // Initialize with Convex client and user ID
  initialize(convex: ConvexReactClient, userId: Id<"users">) {
    this.convex = convex;
    this.userId = userId;

    // Trigger initial sync
    this.processQueue();
  }

  // Clear user (on sign out)
  clearUser() {
    this.userId = null;
    this.updateState({ status: "idle", pendingCount: 0 });
  }

  // Subscribe to sync state changes
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private setupNetworkListeners() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.updateState({ status: "idle" });
      // Debounce to avoid rapid state changes
      setTimeout(() => this.processQueue(), 2000);
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.updateState({ status: "offline" });
    });
  }

  // Queue a mutation for sync
  async queueMutation(
    entityType: EntityType,
    entityId: string,
    operation: SyncOperation,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.userId) {
      // Not authenticated, skip queueing
      return;
    }

    try {
      await invoke("add_to_sync_queue", {
        entityType,
        entityId,
        operation,
        payload: JSON.stringify(payload),
      });

      // Update pending count
      const queue = await this.getQueue();
      this.updateState({ pendingCount: queue.length });

      // Try to process immediately if online
      if (this.isOnline) {
        this.processQueue();
      }
    } catch (err) {
      console.error("[SyncService] Failed to queue mutation:", err);
    }
  }

  // Get current queue from SQLite
  private async getQueue(): Promise<SyncQueueItem[]> {
    try {
      return await invoke<SyncQueueItem[]>("get_sync_queue");
    } catch (err) {
      console.error("[SyncService] Failed to get queue:", err);
      return [];
    }
  }

  // Process queued mutations
  async processQueue(): Promise<void> {
    if (!this.convex || !this.userId || this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    this.updateState({ status: "syncing" });

    try {
      const queue = await this.getQueue();

      for (const item of queue) {
        try {
          await this.syncItem(item);
          await invoke("remove_from_sync_queue", { id: item.id });
        } catch (err) {
          console.error("[SyncService] Failed to sync item:", item.id, err);
          await invoke("increment_sync_attempts", {
            id: item.id,
            error: String(err),
          });
        }
      }

      // Update state after processing
      const remainingQueue = await this.getQueue();
      this.updateState({
        status: remainingQueue.length > 0 ? "error" : "idle",
        lastSyncAt: Date.now(),
        pendingCount: remainingQueue.length,
        error: remainingQueue.length > 0 ? "Some items failed to sync" : null,
      });
    } catch (err) {
      console.error("[SyncService] Queue processing failed:", err);
      this.updateState({
        status: "error",
        error: String(err),
      });
    } finally {
      this.syncInProgress = false;
    }
  }

  // Sync a single item to Convex
  private async syncItem(item: SyncQueueItem): Promise<void> {
    if (!this.convex || !this.userId) {
      throw new Error("Not initialized");
    }

    const payload = JSON.parse(item.payload);

    switch (item.entityType) {
      case "session":
        await this.syncSession(item.operation, item.entityId, payload);
        break;
      case "workspace":
        await this.syncWorkspace(item.operation, item.entityId, payload);
        break;
      case "inbox":
        await this.syncInboxMessage(item.operation, item.entityId, payload);
        break;
      case "comment":
        await this.syncComment(item.operation, item.entityId, payload);
        break;
      default:
        throw new Error(`Unknown entity type: ${item.entityType}`);
    }
  }

  // Entity-specific sync methods
  private async syncSession(
    operation: SyncOperation,
    localId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.convex || !this.userId) return;

    switch (operation) {
      case "create":
        const sessionId = await this.convex.mutation(api.sessions.create, {
          userId: this.userId,
          localSessionId: localId,
          name: payload.name as string,
          cwd: payload.cwd as string,
          workspaceId: payload.workspaceId as Id<"workspaces"> | undefined,
        });
        // Update local record with Convex ID
        await invoke("update_session_convex_id", {
          id: localId,
          convexId: sessionId,
        });
        break;

      case "update":
        // Find Convex session by local ID and update
        const existingSession = await this.convex.query(
          api.sessions.getByLocalSessionId,
          { localSessionId: localId }
        );
        if (existingSession) {
          if (payload.name) {
            await this.convex.mutation(api.sessions.rename, {
              id: existingSession._id,
              name: payload.name as string,
            });
          }
          if (payload.baseCommit) {
            await this.convex.mutation(api.sessions.updateBaseCommit, {
              id: existingSession._id,
              baseCommit: payload.baseCommit as string,
            });
          }
        }
        break;

      case "delete":
        const sessionToDelete = await this.convex.query(
          api.sessions.getByLocalSessionId,
          { localSessionId: localId }
        );
        if (sessionToDelete) {
          await this.convex.mutation(api.sessions.remove, {
            id: sessionToDelete._id,
          });
        }
        break;
    }
  }

  private async syncWorkspace(
    operation: SyncOperation,
    localId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // TODO: Implement workspace sync when Convex workspaces.ts is ready
    console.log("[SyncService] Workspace sync not yet implemented", {
      operation,
      localId,
      payload,
    });
  }

  private async syncInboxMessage(
    operation: SyncOperation,
    localId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // TODO: Implement inbox message sync
    console.log("[SyncService] Inbox sync not yet implemented", {
      operation,
      localId,
      payload,
    });
  }

  private async syncComment(
    operation: SyncOperation,
    localId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    // TODO: Implement comment sync
    console.log("[SyncService] Comment sync not yet implemented", {
      operation,
      localId,
      payload,
    });
  }

  // Pull changes from Convex (for multi-device sync)
  async pullChanges(): Promise<void> {
    if (!this.convex || !this.userId) {
      return;
    }

    try {
      this.updateState({ status: "syncing" });

      // Get user's profile to find last sync time
      const profile = await this.convex.query(api.users.getProfile, {
        userId: this.userId,
      });

      // TODO: Implement delta sync from Convex
      // This would query for changes since profile?.lastSyncAt and apply them locally
      console.log("[SyncService] Last sync at:", profile?.lastSyncAt ?? 0);

      // Update last sync time
      await this.convex.mutation(api.users.updateLastSync, {});

      this.updateState({
        status: "idle",
        lastSyncAt: Date.now(),
      });
    } catch (err) {
      console.error("[SyncService] Pull changes failed:", err);
      this.updateState({
        status: "error",
        error: String(err),
      });
    }
  }

  // Full sync (used on first sign-in)
  async fullSync(): Promise<void> {
    if (!this.convex || !this.userId) {
      return;
    }

    try {
      this.updateState({ status: "syncing" });

      // Push all local data to Convex
      await this.pushAllLocalData();

      // Pull any existing cloud data
      await this.pullChanges();

      this.updateState({
        status: "idle",
        lastSyncAt: Date.now(),
      });
    } catch (err) {
      console.error("[SyncService] Full sync failed:", err);
      this.updateState({
        status: "error",
        error: String(err),
      });
    }
  }

  // Push all local data to Convex using bulk sync API
  private async pushAllLocalData(): Promise<void> {
    if (!this.convex || !this.userId) return;

    // Get all local workspaces that haven't been synced
    const workspaces = await invoke<Array<{
      id: string;
      name: string;
      folder: string;
      originBranch: string;
    }>>("get_unsynced_workspaces");

    // Get all local sessions that haven't been synced
    const sessions = await invoke<Array<{
      id: string;
      name: string;
      cwd: string;
      workspaceId: string | null;
      baseCommit: string | null;
    }>>("get_unsynced_sessions");

    // Use bulk sync API for efficiency
    const results = await this.convex.mutation(api.sync.pushChanges, {
      workspaces: workspaces.map((w) => ({
        localId: w.id,
        name: w.name,
        path: w.folder,
        originBranch: w.originBranch,
        updatedAt: Date.now(),
      })),
      sessions: sessions.map((s) => ({
        localId: s.id,
        name: s.name,
        cwd: s.cwd,
        workspaceLocalId: s.workspaceId ?? undefined,
        baseCommit: s.baseCommit ?? undefined,
        updatedAt: Date.now(),
      })),
    });

    // Update local records with Convex IDs
    for (const { localId, convexId } of results.workspaces) {
      await invoke("update_workspace_convex_id", { id: localId, convexId });
    }
    for (const { localId, convexId } of results.sessions) {
      await invoke("update_session_convex_id", { id: localId, convexId });
    }

    console.log("[SyncService] Bulk push complete:", {
      workspaces: results.workspaces.length,
      sessions: results.sessions.length,
    });
  }

  // Get current sync state
  getState(): SyncState {
    return this.state;
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}
