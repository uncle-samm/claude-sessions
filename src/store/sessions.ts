import { create } from "zustand";
import * as api from "./api";

// Session phase state machine
export type SessionPhase =
  | { type: "pending" }
  | { type: "running_script"; output: string[] }
  | { type: "script_error"; exitCode: number; output: string[] }
  | { type: "ready"; finalCwd: string }
  | { type: "running_claude" };

export interface Session {
  id: string;
  name: string;
  cwd: string;
  finalCwd?: string;
  unreadCount: number;
  isRestored?: boolean;
  started?: boolean;
  workspaceId?: string;
  scriptPath?: string;
  worktreeName?: string;
  phase: SessionPhase;
  awaitingInput?: boolean;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  addSession: (name: string, cwd: string) => Promise<string>;
  addWorkspaceSession: (workspaceId: string, cwd: string, scriptPath: string, worktreeName: string) => Promise<string>;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setPhase: (id: string, phase: SessionPhase) => void;
  appendScriptOutput: (id: string, output: string) => void;
  incrementUnread: (id: string) => void;
  clearUnread: (id: string) => void;
  setAwaitingInput: (id: string, awaiting: boolean) => void;
  loadFromStorage: () => Promise<void>;
  pollSessionStatus: () => void;
}

// Polling interval for session status (from MCP)
let statusPollingInterval: number | null = null;

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  addSession: async (name: string, cwd: string) => {
    const data = await api.createSession(name, cwd, null, null);
    const session: Session = {
      id: data.id,
      name: data.name,
      cwd: data.cwd,
      unreadCount: 0,
      started: true,
      phase: { type: "running_claude" },
      awaitingInput: data.status === "ready",
    };
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: data.id,
    }));
    return data.id;
  },

  addWorkspaceSession: async (workspaceId: string, cwd: string, scriptPath: string, worktreeName: string) => {
    console.log("[SessionStore] addWorkspaceSession called:", { workspaceId, cwd, scriptPath, worktreeName });
    // Create in database first to get the ID
    const data = await api.createSession(worktreeName, cwd, workspaceId, worktreeName);
    const session: Session = {
      id: data.id,
      name: worktreeName,
      cwd,
      unreadCount: 0,
      started: true,
      workspaceId,
      scriptPath,
      worktreeName,
      phase: { type: "running_script", output: [] },
      awaitingInput: false,
    };
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: data.id,
    }));
    console.log("[SessionStore] Session added with id:", data.id);
    return data.id;
  },

  removeSession: (id: string) => {
    // Delete from database (fire and forget)
    api.deleteSession(id).catch(console.error);

    set((state) => {
      const newSessions = state.sessions.filter((s) => s.id !== id);
      let newActiveId = state.activeSessionId;

      if (state.activeSessionId === id) {
        newActiveId = newSessions.length > 0 ? newSessions[0].id : null;
      }

      return {
        sessions: newSessions,
        activeSessionId: newActiveId,
      };
    });
  },

  setActiveSession: (id: string) => {
    const session = get().sessions.find((s) => s.id === id);
    if (session) {
      set((state) => ({
        activeSessionId: id,
        sessions: state.sessions.map((s) =>
          s.id === id ? { ...s, started: true } : s
        ),
      }));
      get().clearUnread(id);
    }
  },

  renameSession: (id: string, name: string) => {
    // Update in database
    api.renameSession(id, name).catch(console.error);

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name } : s
      ),
    }));
  },

  setPhase: (id: string, phase: SessionPhase) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              phase,
              finalCwd: phase.type === "ready" ? phase.finalCwd : s.finalCwd,
            }
          : s
      ),
    }));
  },

  appendScriptOutput: (id: string, output: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== id || s.phase.type !== "running_script") return s;
        return {
          ...s,
          phase: {
            ...s.phase,
            output: [...s.phase.output, output],
          },
        };
      }),
    }));
  },

  incrementUnread: (id: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id && s.unreadCount < 10
          ? { ...s, unreadCount: s.unreadCount + 1 }
          : s
      ),
    }));
  },

  clearUnread: (id: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, unreadCount: 0 } : s
      ),
    }));
  },

  setAwaitingInput: (id: string, awaiting: boolean) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, awaitingInput: awaiting } : s
      ),
    }));
  },

  loadFromStorage: async () => {
    try {
      const data = await api.getSessions();
      if (data.length > 0) {
        set({
          sessions: data.map((s) => ({
            id: s.id,
            name: s.name,
            cwd: s.cwd,
            workspaceId: s.workspace_id || undefined,
            worktreeName: s.worktree_name || undefined,
            unreadCount: 0,
            isRestored: true,
            phase: { type: "running_claude" } as SessionPhase,
            awaitingInput: s.status === "ready",
          })),
          activeSessionId: data[0].id,
        });
      }
    } catch (err) {
      console.error("[SessionStore] Failed to load sessions:", err);
    }
  },

  // Poll database for session status updates (from MCP)
  pollSessionStatus: () => {
    if (statusPollingInterval) return;

    statusPollingInterval = window.setInterval(async () => {
      const sessions = get().sessions;
      for (const session of sessions) {
        if (session.phase.type === "running_claude") {
          try {
            const status = await api.getSessionStatus(session.id);
            const isReady = status === "ready";
            if (session.awaitingInput !== isReady) {
              get().setAwaitingInput(session.id, isReady);
            }
          } catch {
            // Session might not exist in DB yet, ignore
          }
        }
      }
    }, 1000); // Poll every second
  },
}));
