/**
 * Mock for @tauri-apps/api
 * This file mocks the Tauri API for unit testing
 */
import { vi } from 'vitest';

// Store registered event listeners for testing
type EventCallback = (event: { payload: unknown }) => void;
const eventListeners = new Map<string, Set<EventCallback>>();

// Mock invoke responses - can be customized per test
export const mockInvokeResponses = new Map<string, unknown>();

// Core module
export const invoke = vi.fn(async (cmd: string, args?: unknown) => {
  if (mockInvokeResponses.has(cmd)) {
    const response = mockInvokeResponses.get(cmd);
    if (typeof response === 'function') {
      return response(args);
    }
    return response;
  }
  // Default responses for common commands
  switch (cmd) {
    case 'get_sessions':
      return [];
    case 'get_workspaces':
      return [];
    case 'get_settings':
      return { defaultModel: 'claude-sonnet-4-20250514', terminalFontSize: 13, theme: 'dark' };
    case 'create_session':
      return { id: 'test-session-id', name: 'Test Session', workspaceId: null };
    default:
      return null;
  }
});

// Event module
export const listen = vi.fn(async (event: string, callback: EventCallback) => {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(callback);

  // Return unlisten function
  return () => {
    eventListeners.get(event)?.delete(callback);
  };
});

export const emit = vi.fn(async (event: string, payload?: unknown) => {
  const listeners = eventListeners.get(event);
  if (listeners) {
    listeners.forEach((callback) => callback({ payload }));
  }
});

export const once = vi.fn(async (event: string, callback: EventCallback) => {
  const unlisten = await listen(event, (e) => {
    callback(e);
    unlisten();
  });
  return unlisten;
});

// Helper to emit events in tests
export const emitTestEvent = (event: string, payload: unknown) => {
  const listeners = eventListeners.get(event);
  if (listeners) {
    listeners.forEach((callback) => callback({ payload }));
  }
};

// Helper to clear all mocks between tests
export const clearTauriMocks = () => {
  eventListeners.clear();
  mockInvokeResponses.clear();
  invoke.mockClear();
  listen.mockClear();
  emit.mockClear();
  once.mockClear();
};

// Re-export as module structure matching @tauri-apps/api
export const core = { invoke };
export const event = { listen, emit, once };

// Default export matching the module structure
export default {
  invoke,
  listen,
  emit,
  once,
  core,
  event,
};
