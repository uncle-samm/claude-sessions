import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useConvex } from "convex/react";
import {
  getSyncService,
  SyncService,
  SyncState,
  EntityType,
  SyncOperation,
} from "./SyncService";
import { useAuth } from "../hooks/useAuth";

interface SyncContextValue {
  syncState: SyncState;
  syncService: SyncService;
  queueMutation: (
    entityType: EntityType,
    entityId: string,
    operation: SyncOperation,
    payload: Record<string, unknown>
  ) => Promise<void>;
  triggerSync: () => Promise<void>;
  triggerFullSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const convex = useConvex();
  const { user, isAuthenticated } = useAuth();
  const syncService = getSyncService();

  const [syncState, setSyncState] = useState<SyncState>(syncService.getState());

  // Subscribe to sync state changes
  useEffect(() => {
    return syncService.subscribe(setSyncState);
  }, [syncService]);

  // Initialize sync service when user authenticates
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      syncService.initialize(convex, user.id);
    } else {
      syncService.clearUser();
    }
  }, [isAuthenticated, user?.id, convex, syncService]);

  const queueMutation = useCallback(
    async (
      entityType: EntityType,
      entityId: string,
      operation: SyncOperation,
      payload: Record<string, unknown>
    ) => {
      await syncService.queueMutation(entityType, entityId, operation, payload);
    },
    [syncService]
  );

  const triggerSync = useCallback(async () => {
    await syncService.processQueue();
  }, [syncService]);

  const triggerFullSync = useCallback(async () => {
    await syncService.fullSync();
  }, [syncService]);

  return (
    <SyncContext.Provider
      value={{
        syncState,
        syncService,
        queueMutation,
        triggerSync,
        triggerFullSync,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}

// Hook to get just the sync state (for display purposes)
export function useSyncState(): SyncState {
  const { syncState } = useSync();
  return syncState;
}
