import { create } from "zustand";

export type ViewMode = "terminal" | "diff";

interface ViewModeStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useViewModeStore = create<ViewModeStore>((set) => ({
  viewMode: "terminal",
  setViewMode: (mode) => set({ viewMode: mode }),
}));
