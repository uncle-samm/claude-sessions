import { create } from "zustand";
import * as api from "./api";

// Session phase state machine
export type SessionPhase =
  | { type: "idle" }  // No PTY running, waiting for activation
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
  baseCommit?: string; // Git commit SHA to diff against (stable reference)
  lastActivityAt?: number; // Timestamp of last terminal activity (for auto-idle)
  isClaudeBusy?: boolean; // True when terminal shows "(esc to interrupt)"
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  addSession: (name: string, cwd: string) => Promise<string>;
  addWorkspaceSession: (workspaceId: string, cwd: string, scriptPath: string, worktreeName: string, baseCommit?: string) => Promise<string>;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setPhase: (id: string, phase: SessionPhase) => void;
  setCwd: (id: string, cwd: string) => void;
  appendScriptOutput: (id: string, output: string) => void;
  incrementUnread: (id: string) => void;
  clearUnread: (id: string) => void;
  setAwaitingInput: (id: string, awaiting: boolean) => void;
  setBaseCommit: (id: string, baseCommit: string) => void;
  updateActivity: (id: string) => void;
  activateSession: (id: string) => void;
  idleSession: (id: string) => void;
  setClaudeBusy: (id: string, busy: boolean) => void;
  loadFromStorage: () => Promise<void>;
  pollSessionStatus: () => void;
  startAutoIdleTimer: () => void;
}

// Polling interval for session status (from MCP)
let statusPollingInterval: number | null = null;
let autoIdleInterval: number | null = null;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

  addWorkspaceSession: async (workspaceId: string, cwd: string, scriptPath: string, worktreeName: string, baseCommit?: string) => {
    console.log("[SessionStore] addWorkspaceSession called:", { workspaceId, cwd, scriptPath, worktreeName, baseCommit });
    // Create in database first to get the ID
    const data = await api.createSession(worktreeName, cwd, workspaceId, worktreeName, baseCommit || null);
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
      baseCommit,
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

  setCwd: (id: string, cwd: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, cwd, finalCwd: cwd } : s
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

  setBaseCommit: (id: string, baseCommit: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, baseCommit } : s
      ),
    }));
  },

  updateActivity: (id: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, lastActivityAt: Date.now() } : s
      ),
    }));
  },

  activateSession: (id: string) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.phase.type !== "idle") return;

    // Transition from idle to running_claude (Terminal will spawn PTY with --continue)
    // Set awaitingInput to true initially - assume ready until MCP says otherwise
    // This prevents the spinner from flashing when session first activates
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? { ...s, phase: { type: "running_claude" }, lastActivityAt: Date.now(), awaitingInput: true }
          : s
      ),
    }));
  },

  idleSession: (id: string) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session || session.phase.type !== "running_claude") return;

    // Transition from running_claude to idle (Terminal will kill PTY)
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, phase: { type: "idle" } } : s
      ),
    }));
  },

  setClaudeBusy: (id: string, busy: boolean) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, isClaudeBusy: busy } : s
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
            // Start restored sessions as IDLE - no PTY spawned until activated
            phase: { type: "idle" } as SessionPhase,
            // Default to true (ready) for idle sessions - no spinner until we poll and confirm busy
            awaitingInput: true,
            baseCommit: s.base_commit || undefined,
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

  // Auto-idle timer: check every 30s for sessions that should go idle
  startAutoIdleTimer: () => {
    if (autoIdleInterval) return;

    autoIdleInterval = window.setInterval(() => {
      const sessions = get().sessions;
      const now = Date.now();

      for (const session of sessions) {
        // Only check sessions that are running_claude
        if (session.phase.type !== "running_claude") continue;

        // Never idle if Claude is busy (not awaiting input means busy)
        if (!session.awaitingInput) continue;

        // Check if inactive for IDLE_TIMEOUT_MS
        const lastActivity = session.lastActivityAt || 0;
        if (now - lastActivity > IDLE_TIMEOUT_MS) {
          console.log(`[SessionStore] Auto-idling session ${session.id} due to inactivity`);
          get().idleSession(session.id);
        }
      }
    }, 30000); // Check every 30 seconds
  },
}));
