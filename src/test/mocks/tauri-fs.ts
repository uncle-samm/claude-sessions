/**
 * Mock for @tauri-apps/plugin-fs
 */
import { vi } from 'vitest';

export const watch = vi.fn(async (
  _paths: string | string[],
  _callback: (event: unknown) => void,
  _options?: unknown
) => {
  // Return unwatch function
  return vi.fn();
});

export type UnwatchFn = () => void;

export const readTextFile = vi.fn(async () => '');
export const writeTextFile = vi.fn(async () => {});
export const readDir = vi.fn(async () => []);
export const exists = vi.fn(async () => true);
export const mkdir = vi.fn(async () => {});
export const remove = vi.fn(async () => {});
export const rename = vi.fn(async () => {});
export const copyFile = vi.fn(async () => {});

export default {
  watch,
  readTextFile,
  writeTextFile,
  readDir,
  exists,
  mkdir,
  remove,
  rename,
  copyFile,
};
