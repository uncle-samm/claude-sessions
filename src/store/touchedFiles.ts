import { create } from "zustand";

interface TouchedFilesStore {
  touchedBySession: Record<string, string[]>;
  addTouchedFiles: (sessionId: string, files: string[]) => void;
  clearTouchedFiles: (sessionId: string) => void;
}

export const useTouchedFilesStore = create<TouchedFilesStore>((set) => ({
  touchedBySession: {},

  addTouchedFiles: (sessionId: string, files: string[]) => {
    if (!sessionId || files.length === 0) return;

    set((state) => {
      const existing = new Set(state.touchedBySession[sessionId] || []);
      for (const file of files) {
        if (file) existing.add(file);
      }
      return {
        touchedBySession: {
          ...state.touchedBySession,
          [sessionId]: Array.from(existing),
        },
      };
    });
  },

  clearTouchedFiles: (sessionId: string) => {
    set((state) => {
      if (!state.touchedBySession[sessionId]) return state;
      const next = { ...state.touchedBySession };
      delete next[sessionId];
      return { touchedBySession: next };
    });
  },
}));
