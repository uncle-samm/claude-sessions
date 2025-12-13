import { create } from "zustand";

// Types matching the Rust ClaudeMessage structure
export interface TextContent {
  type: "text";
  text: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content?: unknown;
  is_error?: boolean;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent | ThinkingContent | { type: string };

export interface AssistantMessage {
  id?: string;
  role?: string;
  model?: string;
  content: ContentBlock[];
  stop_reason?: string;
}

// Simplified message type for UI
export interface ChatMessage {
  id: string;
  type: "user" | "assistant" | "system" | "error";
  content: ContentBlock[];
  timestamp: number;
  // For result messages
  cost?: number;
  duration?: number;
}

// Claude session state (from init message)
export interface ClaudeSessionInfo {
  claudeSessionId?: string; // The session ID from Claude (for --resume)
  tools?: string[];
  model?: string;
}

interface MessageStore {
  // Messages per session
  messagesBySession: Record<string, ChatMessage[]>;
  // Claude session info per session
  sessionInfo: Record<string, ClaudeSessionInfo>;
  // Loading state per session
  isLoading: Record<string, boolean>;
  // Error state per session
  error: Record<string, string | null>;

  // Actions
  addMessage: (sessionId: string, message: ChatMessage) => void;
  addUserMessage: (sessionId: string, text: string) => void;
  setMessages: (sessionId: string, messages: ChatMessage[]) => void;
  setSessionInfo: (sessionId: string, info: ClaudeSessionInfo) => void;
  setLoading: (sessionId: string, loading: boolean) => void;
  setError: (sessionId: string, error: string | null) => void;
  clearMessages: (sessionId: string) => void;
  getMessages: (sessionId: string) => ChatMessage[];
  getSessionInfo: (sessionId: string) => ClaudeSessionInfo | undefined;
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messagesBySession: {},
  sessionInfo: {},
  isLoading: {},
  error: {},

  addMessage: (sessionId: string, message: ChatMessage) => {
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: [...(state.messagesBySession[sessionId] || []), message],
      },
    }));
  },

  addUserMessage: (sessionId: string, text: string) => {
    const message: ChatMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      content: [{ type: "text", text }],
      timestamp: Date.now(),
    };
    get().addMessage(sessionId, message);
  },

  setMessages: (sessionId: string, messages: ChatMessage[]) => {
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages,
      },
    }));
  },

  setSessionInfo: (sessionId: string, info: ClaudeSessionInfo) => {
    set((state) => ({
      sessionInfo: {
        ...state.sessionInfo,
        [sessionId]: { ...state.sessionInfo[sessionId], ...info },
      },
    }));
  },

  setLoading: (sessionId: string, loading: boolean) => {
    set((state) => ({
      isLoading: {
        ...state.isLoading,
        [sessionId]: loading,
      },
    }));
  },

  setError: (sessionId: string, error: string | null) => {
    set((state) => ({
      error: {
        ...state.error,
        [sessionId]: error,
      },
    }));
  },

  clearMessages: (sessionId: string) => {
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: [],
      },
      error: {
        ...state.error,
        [sessionId]: null,
      },
    }));
  },

  getMessages: (sessionId: string) => {
    return get().messagesBySession[sessionId] || [];
  },

  getSessionInfo: (sessionId: string) => {
    return get().sessionInfo[sessionId];
  },
}));
