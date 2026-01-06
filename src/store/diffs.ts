import { create } from "zustand";
import * as api from "./api";

export interface DiffState {
  summary: api.DiffSummary | null;
  expandedFiles: Set<string>;
  fileContents: Map<string, api.FileDiff>;
  isLoading: boolean;
  error: string | null;
  currentBranch: string | null;
  activeKey: string | null;
  summaryCache: Record<string, api.DiffSummary>;
  fileCache: Record<string, Map<string, api.FileDiff>>;
  expandedCache: Record<string, Set<string>>;
}

interface DiffStore extends DiffState {
  loadDiffSummary: (worktreePath: string, baseBranch: string, cacheKey: string, options?: { force?: boolean }) => Promise<void>;
  loadFileDiff: (worktreePath: string, filePath: string, baseBranch: string, cacheKey: string) => Promise<void>;
  toggleFileExpanded: (filePath: string, cacheKey: string) => void;
  loadCurrentBranch: (worktreePath: string) => Promise<void>;
  clearDiff: (cacheKey?: string) => void;
}

export const useDiffStore = create<DiffStore>((set, get) => ({
  summary: null,
  expandedFiles: new Set(),
  fileContents: new Map(),
  isLoading: false,
  error: null,
  currentBranch: null,
  activeKey: null,
  summaryCache: {},
  fileCache: {},
  expandedCache: {},

  loadDiffSummary: async (worktreePath: string, baseBranch: string, cacheKey: string, options?: { force?: boolean }) => {
    const shouldForce = options?.force ?? false;

    set((state) => {
      const cachedSummary = state.summaryCache[cacheKey] || null;
      const cachedFileContents = state.fileCache[cacheKey] ? new Map(state.fileCache[cacheKey]) : new Map();
      const cachedExpanded: Set<string> = state.expandedCache[cacheKey] ? new Set(state.expandedCache[cacheKey]) : new Set();

      return {
        activeKey: cacheKey,
        summary: cachedSummary,
        fileContents: shouldForce ? new Map() : cachedFileContents,
        expandedFiles: shouldForce ? new Set() : cachedExpanded,
        isLoading: shouldForce ? true : !cachedSummary,
        error: null,
        fileCache: shouldForce ? { ...state.fileCache, [cacheKey]: new Map() } : state.fileCache,
        expandedCache: shouldForce ? { ...state.expandedCache, [cacheKey]: new Set() } : state.expandedCache,
      };
    });

    if (!shouldForce) {
      const cachedSummary = get().summaryCache[cacheKey];
      if (cachedSummary) return;
    }

    try {
      const summary = await api.getDiffSummary(worktreePath, baseBranch);
      set((state) => ({
        summary,
        isLoading: false,
        summaryCache: { ...state.summaryCache, [cacheKey]: summary },
      }));
    } catch (err) {
      console.error("[DiffStore] Failed to load diff summary:", err);
      set({ error: String(err), isLoading: false });
    }
  },

  loadFileDiff: async (worktreePath: string, filePath: string, baseBranch: string, cacheKey: string) => {
    const cachedFile = get().fileCache[cacheKey]?.get(filePath);
    if (cachedFile) {
      set((state) => ({
        fileContents: new Map(state.fileCache[cacheKey]),
      }));
      return;
    }
    try {
      const fileDiff = await api.getFileDiff(worktreePath, filePath, baseBranch);
      set((state) => {
        const newContents = new Map(state.fileContents);
        newContents.set(filePath, fileDiff);
        const cachedContents = new Map(state.fileCache[cacheKey] || []);
        cachedContents.set(filePath, fileDiff);
        return {
          fileContents: newContents,
          fileCache: { ...state.fileCache, [cacheKey]: cachedContents },
        };
      });
    } catch (err) {
      console.error("[DiffStore] Failed to load file diff:", err);
    }
  },

  toggleFileExpanded: (filePath: string, cacheKey: string) => {
    set((state) => {
      const newExpanded = new Set(state.expandedFiles);
      if (newExpanded.has(filePath)) {
        newExpanded.delete(filePath);
      } else {
        newExpanded.add(filePath);
      }
      return {
        expandedFiles: newExpanded,
        expandedCache: { ...state.expandedCache, [cacheKey]: new Set(newExpanded) },
      };
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

  clearDiff: (cacheKey?: string) => {
    if (!cacheKey) {
      set({
        summary: null,
        expandedFiles: new Set(),
        fileContents: new Map(),
        error: null,
        currentBranch: null,
        activeKey: null,
        summaryCache: {},
        fileCache: {},
        expandedCache: {},
      });
      return;
    }

    set((state) => {
      const { [cacheKey]: _, ...summaryCache } = state.summaryCache;
      const { [cacheKey]: __, ...fileCache } = state.fileCache;
      const { [cacheKey]: ___, ...expandedCache } = state.expandedCache;
      const shouldClearActive = state.activeKey === cacheKey;

      return {
        summaryCache,
        fileCache,
        expandedCache,
        summary: shouldClearActive ? null : state.summary,
        fileContents: shouldClearActive ? new Map() : state.fileContents,
        expandedFiles: shouldClearActive ? new Set() : state.expandedFiles,
        activeKey: shouldClearActive ? null : state.activeKey,
        error: shouldClearActive ? null : state.error,
      };
    });
  },
}));
