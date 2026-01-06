/**
 * Mock for @tauri-apps/plugin-dialog
 */
import { vi } from 'vitest';

export const open = vi.fn(async () => null);
export const save = vi.fn(async () => null);
export const message = vi.fn(async () => {});
export const ask = vi.fn(async () => true);
export const confirm = vi.fn(async () => true);

export default { open, save, message, ask, confirm };
