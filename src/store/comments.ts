import { create } from "zustand";
import * as api from "./api";

export interface Comment {
  id: string;
  sessionId: string;
  filePath: string;
  lineNumber: number | null;
  lineType: string | null;
  author: string;
  content: string;
  status: "open" | "resolved";
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function apiToComment(data: api.DiffCommentData): Comment {
  return {
    id: data.id,
    sessionId: data.session_id,
    filePath: data.file_path,
    lineNumber: data.line_number,
    lineType: data.line_type,
    author: data.author,
    content: data.content,
    status: data.status,
    parentId: data.parent_id,
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

interface CommentStore {
  comments: Comment[];
  isLoading: boolean;
  loadComments: (sessionId: string) => Promise<void>;
  addComment: (
    sessionId: string,
    filePath: string,
    lineNumber: number | null,
    lineType: string | null,
    content: string
  ) => Promise<void>;
  replyToComment: (parentId: string, content: string) => Promise<void>;
  resolveComment: (id: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  getCommentsForFile: (filePath: string) => Comment[];
  getCommentsForLine: (filePath: string, lineNumber: number, lineType: string) => Comment[];
  clearComments: () => void;
}

export const useCommentStore = create<CommentStore>((set, get) => ({
  comments: [],
  isLoading: false,

  loadComments: async (sessionId: string) => {
    set({ isLoading: true });
    try {
      const data = await api.getCommentsForSession(sessionId);
      set({ comments: data.map(apiToComment), isLoading: false });
    } catch (err) {
      console.error("[CommentStore] Failed to load comments:", err);
      set({ isLoading: false });
    }
  },

  addComment: async (sessionId, filePath, lineNumber, lineType, content) => {
    try {
      const data = await api.createComment(
        sessionId,
        filePath,
        lineNumber,
        lineType,
        "user",
        content,
        null
      );
      set((state) => ({
        comments: [...state.comments, apiToComment(data)],
      }));
    } catch (err) {
      console.error("[CommentStore] Failed to add comment:", err);
    }
  },

  replyToComment: async (parentId, content) => {
    try {
      const data = await api.replyToComment(parentId, "user", content);
      set((state) => ({
        comments: [...state.comments, apiToComment(data)],
      }));
    } catch (err) {
      console.error("[CommentStore] Failed to reply to comment:", err);
    }
  },

  resolveComment: async (id) => {
    try {
      await api.resolveComment(id);
      set((state) => ({
        comments: state.comments.map((c) =>
          c.id === id ? { ...c, status: "resolved" as const } : c
        ),
      }));
    } catch (err) {
      console.error("[CommentStore] Failed to resolve comment:", err);
    }
  },

  deleteComment: async (id) => {
    try {
      await api.deleteComment(id);
      set((state) => ({
        comments: state.comments.filter((c) => c.id !== id && c.parentId !== id),
      }));
    } catch (err) {
      console.error("[CommentStore] Failed to delete comment:", err);
    }
  },

  getCommentsForFile: (filePath) => {
    return get().comments.filter((c) => c.filePath === filePath);
  },

  getCommentsForLine: (filePath, lineNumber, lineType) => {
    return get().comments.filter(
      (c) =>
        c.filePath === filePath &&
        c.lineNumber === lineNumber &&
        c.lineType === lineType
    );
  },

  clearComments: () => {
    set({ comments: [] });
  },
}));
