import { create } from "zustand";
import * as api from "./api";

export interface InboxMessage {
  id: string;
  sessionId: string;
  sessionName: string;
  message: string;
  createdAt: Date;
  readAt: Date | null;
  firstReadAt: Date | null;  // Set once when first read, never cleared
}

// Helper to determine if message is "manually unread" (was read before but now unread)
export function isManuallyUnread(message: InboxMessage): boolean {
  return message.readAt === null && message.firstReadAt !== null;
}

// Helper to determine if message is "naturally unread" (never been read)
export function isNaturallyUnread(message: InboxMessage): boolean {
  return message.readAt === null && message.firstReadAt === null;
}

interface InboxStore {
  messages: InboxMessage[];
  isExpanded: boolean;
  isLoading: boolean;
  loadMessages: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  markSessionRead: (sessionId: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  toggleExpanded: () => void;
  startPolling: () => void;
  stopPolling: () => void;
  getUnreadCountForSession: (sessionId: string) => { natural: number; manual: number };
}

let pollingInterval: number | null = null;

export const useInboxStore = create<InboxStore>((set, get) => ({
  messages: [],
  isExpanded: true,
  isLoading: false,

  loadMessages: async () => {
    try {
      const data = await api.getInboxMessages();
      set({
        messages: data.map((m) => ({
          id: m.id,
          sessionId: m.session_id,
          sessionName: m.session_name,
          message: m.message,
          createdAt: new Date(m.created_at),
          readAt: m.read_at ? new Date(m.read_at) : null,
          firstReadAt: m.first_read_at ? new Date(m.first_read_at) : null,
        })),
      });
    } catch (err) {
      console.error("[InboxStore] Failed to load messages:", err);
    }
  },

  markRead: async (id: string) => {
    const now = new Date();
    try {
      await api.markInboxMessageRead(id);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === id ? { ...m, readAt: now, firstReadAt: m.firstReadAt || now } : m
        ),
      }));
    } catch (err) {
      console.error("[InboxStore] Failed to mark message read:", err);
    }
  },

  markUnread: async (id: string) => {
    try {
      await api.markInboxMessageUnread(id);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === id ? { ...m, readAt: null } : m
        ),
      }));
    } catch (err) {
      console.error("[InboxStore] Failed to mark message unread:", err);
    }
  },

  markSessionRead: async (sessionId: string) => {
    const now = new Date();
    try {
      await api.markSessionMessagesRead(sessionId);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.sessionId === sessionId && m.readAt === null
            ? { ...m, readAt: now, firstReadAt: m.firstReadAt || now }
            : m
        ),
      }));
    } catch (err) {
      console.error("[InboxStore] Failed to mark session messages read:", err);
    }
  },

  deleteMessage: async (id: string) => {
    try {
      await api.deleteInboxMessage(id);
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== id),
      }));
    } catch (err) {
      console.error("[InboxStore] Failed to delete message:", err);
    }
  },

  clearAll: async () => {
    try {
      await api.clearInbox();
      set({ messages: [] });
    } catch (err) {
      console.error("[InboxStore] Failed to clear inbox:", err);
    }
  },

  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }));
  },

  startPolling: () => {
    if (pollingInterval) return;

    // Initial load
    get().loadMessages();

    // Poll every 3 seconds
    pollingInterval = window.setInterval(() => {
      get().loadMessages();
    }, 3000);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },

  // Get unread counts for a specific session
  // Returns { natural: count, manual: count }
  // natural = never been read (show number badge)
  // manual = was read but marked unread (show dot)
  getUnreadCountForSession: (sessionId: string) => {
    const messages = get().messages.filter((m) => m.sessionId === sessionId);
    let natural = 0;
    let manual = 0;
    for (const m of messages) {
      if (m.readAt === null) {
        if (m.firstReadAt === null) {
          natural++;
        } else {
          manual++;
        }
      }
    }
    return { natural, manual };
  },
}));
