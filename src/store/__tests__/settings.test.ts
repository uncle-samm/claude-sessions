import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore, PermissionMode } from '../settings';

describe('SettingsStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useSettingsStore.setState({
      debugPauseAfterSetup: true,
      thinkingEnabled: false,
      permissionMode: 'normal',
      todosPanelVisible: true,
      verboseMode: false,
    });
  });

  describe('thinkingEnabled', () => {
    it('should default to false', () => {
      expect(useSettingsStore.getState().thinkingEnabled).toBe(false);
    });

    it('should toggle thinking mode', () => {
      useSettingsStore.getState().toggleThinking();
      expect(useSettingsStore.getState().thinkingEnabled).toBe(true);

      useSettingsStore.getState().toggleThinking();
      expect(useSettingsStore.getState().thinkingEnabled).toBe(false);
    });

    it('should set thinking mode directly', () => {
      useSettingsStore.getState().setThinking(true);
      expect(useSettingsStore.getState().thinkingEnabled).toBe(true);

      useSettingsStore.getState().setThinking(false);
      expect(useSettingsStore.getState().thinkingEnabled).toBe(false);
    });
  });

  describe('permissionMode', () => {
    it('should default to normal', () => {
      expect(useSettingsStore.getState().permissionMode).toBe('normal');
    });

    it('should cycle through permission modes', () => {
      const { cyclePermissionMode } = useSettingsStore.getState();

      cyclePermissionMode();
      expect(useSettingsStore.getState().permissionMode).toBe('acceptEdits');

      cyclePermissionMode();
      expect(useSettingsStore.getState().permissionMode).toBe('plan');

      cyclePermissionMode();
      expect(useSettingsStore.getState().permissionMode).toBe('normal');
    });

    it('should set permission mode directly', () => {
      const modes: PermissionMode[] = ['normal', 'acceptEdits', 'plan'];

      modes.forEach((mode) => {
        useSettingsStore.getState().setPermissionMode(mode);
        expect(useSettingsStore.getState().permissionMode).toBe(mode);
      });
    });
  });

  describe('todosPanelVisible', () => {
    it('should default to true', () => {
      expect(useSettingsStore.getState().todosPanelVisible).toBe(true);
    });

    it('should toggle todos panel visibility', () => {
      useSettingsStore.getState().toggleTodosPanel();
      expect(useSettingsStore.getState().todosPanelVisible).toBe(false);

      useSettingsStore.getState().toggleTodosPanel();
      expect(useSettingsStore.getState().todosPanelVisible).toBe(true);
    });

    it('should set todos panel visibility directly', () => {
      useSettingsStore.getState().setTodosPanelVisible(false);
      expect(useSettingsStore.getState().todosPanelVisible).toBe(false);

      useSettingsStore.getState().setTodosPanelVisible(true);
      expect(useSettingsStore.getState().todosPanelVisible).toBe(true);
    });
  });

  describe('verboseMode', () => {
    it('should default to false', () => {
      expect(useSettingsStore.getState().verboseMode).toBe(false);
    });

    it('should toggle verbose mode', () => {
      useSettingsStore.getState().toggleVerboseMode();
      expect(useSettingsStore.getState().verboseMode).toBe(true);

      useSettingsStore.getState().toggleVerboseMode();
      expect(useSettingsStore.getState().verboseMode).toBe(false);
    });
  });

  describe('debugPauseAfterSetup', () => {
    it('should default to true', () => {
      expect(useSettingsStore.getState().debugPauseAfterSetup).toBe(true);
    });

    it('should toggle debug pause', () => {
      useSettingsStore.getState().toggleDebugPauseAfterSetup();
      expect(useSettingsStore.getState().debugPauseAfterSetup).toBe(false);

      useSettingsStore.getState().toggleDebugPauseAfterSetup();
      expect(useSettingsStore.getState().debugPauseAfterSetup).toBe(true);
    });

    it('should set debug pause directly', () => {
      useSettingsStore.getState().setDebugPauseAfterSetup(false);
      expect(useSettingsStore.getState().debugPauseAfterSetup).toBe(false);
    });
  });
});
