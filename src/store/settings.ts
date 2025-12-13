import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PermissionMode = "normal" | "acceptEdits" | "plan";

interface SettingsStore {
  // Debug flag: pause after setup script completes to see what happened
  debugPauseAfterSetup: boolean;
  setDebugPauseAfterSetup: (value: boolean) => void;
  toggleDebugPauseAfterSetup: () => void;

  // Thinking mode (Tab to toggle)
  thinkingEnabled: boolean;
  toggleThinking: () => void;
  setThinking: (value: boolean) => void;

  // Permission mode (Shift+Tab to cycle)
  permissionMode: PermissionMode;
  cyclePermissionMode: () => void;
  setPermissionMode: (mode: PermissionMode) => void;

  // TodoWrite panel visibility (Ctrl+T to toggle)
  todosPanelVisible: boolean;
  toggleTodosPanel: () => void;
  setTodosPanelVisible: (value: boolean) => void;

  // Verbose mode for thinking blocks (Ctrl+O to toggle)
  verboseMode: boolean;
  toggleVerboseMode: () => void;
}

const PERMISSION_MODES: PermissionMode[] = ["normal", "acceptEdits", "plan"];

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      debugPauseAfterSetup: true,

      setDebugPauseAfterSetup: (value: boolean) => {
        set({ debugPauseAfterSetup: value });
      },

      toggleDebugPauseAfterSetup: () => {
        set((state) => ({ debugPauseAfterSetup: !state.debugPauseAfterSetup }));
      },

      // Thinking mode
      thinkingEnabled: false,
      toggleThinking: () => {
        set((state) => ({ thinkingEnabled: !state.thinkingEnabled }));
      },
      setThinking: (value: boolean) => {
        set({ thinkingEnabled: value });
      },

      // Permission mode
      permissionMode: "normal" as PermissionMode,
      cyclePermissionMode: () => {
        set((state) => {
          const currentIndex = PERMISSION_MODES.indexOf(state.permissionMode);
          const nextIndex = (currentIndex + 1) % PERMISSION_MODES.length;
          return { permissionMode: PERMISSION_MODES[nextIndex] };
        });
      },
      setPermissionMode: (mode: PermissionMode) => {
        set({ permissionMode: mode });
      },

      // TodoWrite panel
      todosPanelVisible: true,
      toggleTodosPanel: () => {
        set((state) => ({ todosPanelVisible: !state.todosPanelVisible }));
      },
      setTodosPanelVisible: (value: boolean) => {
        set({ todosPanelVisible: value });
      },

      // Verbose mode
      verboseMode: false,
      toggleVerboseMode: () => {
        set((state) => ({ verboseMode: !state.verboseMode }));
      },
    }),
    {
      name: "claude-sessions-settings",
      partialize: (state) => ({
        thinkingEnabled: state.thinkingEnabled,
        permissionMode: state.permissionMode,
        todosPanelVisible: state.todosPanelVisible,
        verboseMode: state.verboseMode,
      }),
    }
  )
);
