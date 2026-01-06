/**
 * Mock for tauri-pty
 */
import { vi } from 'vitest';

export interface IPty {
  pid: number;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitCode: number) => void) => void;
}

// Mock PTY instance
const createMockPty = (): IPty => {
  const dataCallbacks: Array<(data: string) => void> = [];
  const exitCallbacks: Array<(exitCode: number) => void> = [];

  return {
    pid: Math.floor(Math.random() * 10000) + 1000,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => {
      exitCallbacks.forEach((cb) => cb(0));
    }),
    onData: vi.fn((callback: (data: string) => void) => {
      dataCallbacks.push(callback);
    }),
    onExit: vi.fn((callback: (exitCode: number) => void) => {
      exitCallbacks.push(callback);
    }),
  };
};

export const spawn = vi.fn(async (
  _shell: string,
  _args?: string[],
  _options?: {
    cwd?: string;
    env?: Record<string, string>;
    cols?: number;
    rows?: number;
  }
): Promise<IPty> => {
  return createMockPty();
});

export default { spawn };
