import { create } from "zustand";
import * as api from "./api";

export interface DiffState {
  summary: api.DiffSummary | null;
  expandedFiles: Set<string>;
  fileContents: Map<string, api.FileDiff>;
  isLoading: boolean;
  error: string | null;
  currentBranch: string | null;
}

interface DiffStore extends DiffState {
  loadDiffSummary: (worktreePath: string, baseBranch: string) => Promise<void>;
  loadFileDiff: (worktreePath: string, filePath: string, baseBranch: string) => Promise<void>;
  toggleFileExpanded: (filePath: string) => void;
  loadCurrentBranch: (worktreePath: string) => Promise<void>;
  clearDiff: () => void;
}

export const useDiffStore = create<DiffStore>((set) => ({
  summary: null,
  expandedFiles: new Set(),
  fileContents: new Map(),
  isLoading: false,
  error: null,
  currentBranch: null,

  loadDiffSummary: async (worktreePath: string, baseBranch: string) => {
    set({ isLoading: true, error: null });
    try {
      const summary = await api.getDiffSummary(worktreePath, baseBranch);
      set({ summary, isLoading: false });
    } catch (err) {
      console.error("[DiffStore] Failed to load diff summary:", err);
      set({ error: String(err), isLoading: false });
    }
  },

  loadFileDiff: async (worktreePath: string, filePath: string, baseBranch: string) => {
    try {
      const fileDiff = await api.getFileDiff(worktreePath, filePath, baseBranch);
      set((state) => {
        const newContents = new Map(state.fileContents);
        newContents.set(filePath, fileDiff);
        return { fileContents: newContents };
      });
    } catch (err) {
      console.error("[DiffStore] Failed to load file diff:", err);
    }
  },

  toggleFileExpanded: (filePath: string) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFiles);
      if (newExpanded.has(filePath)) {
        newExpanded.delete(filePath);
      } else {
        newExpanded.add(filePath);
      }
      return { expandedFiles: newExpanded };
    });
  },

  loadCurrentBranch: async (worktreePath: string) => {
    try {
      const currentBranch = await api.getCurrentBranch(worktreePath);
      set({ currentBranch });
    } catch (err) {
      console.error("[DiffStore] Failed to load current branch:", err);
    }
  },

  clearDiff: () => {
    set({
      summary: null,
      expandedFiles: new Set(),
      fileContents: new Map(),
      error: null,
      currentBranch: null,
    });
  },
}));
