/**
 * Mock for @tauri-apps/plugin-shell
 */
import { vi } from 'vitest';

export const Command = {
  create: vi.fn(() => ({
    execute: vi.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
    spawn: vi.fn(async () => ({
      pid: 12345,
      kill: vi.fn(),
      write: vi.fn(),
    })),
    on: vi.fn(),
  })),
};

export const open = vi.fn(async () => {});

export default { Command, open };
