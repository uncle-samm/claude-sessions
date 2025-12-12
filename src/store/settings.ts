import { create } from "zustand";

interface SettingsStore {
  // Debug flag: pause after setup script completes to see what happened
  debugPauseAfterSetup: boolean;
  setDebugPauseAfterSetup: (value: boolean) => void;
  toggleDebugPauseAfterSetup: () => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  debugPauseAfterSetup: true, // Default to true for debugging

  setDebugPauseAfterSetup: (value: boolean) => {
    set({ debugPauseAfterSetup: value });
  },

  toggleDebugPauseAfterSetup: () => {
    set((state) => ({ debugPauseAfterSetup: !state.debugPauseAfterSetup }));
  },
}));
