import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    alias: {
      '@tauri-apps/api/core': path.resolve(__dirname, './src/test/mocks/tauri.ts'),
      '@tauri-apps/api/event': path.resolve(__dirname, './src/test/mocks/tauri.ts'),
      '@tauri-apps/api': path.resolve(__dirname, './src/test/mocks/tauri.ts'),
      '@tauri-apps/plugin-shell': path.resolve(__dirname, './src/test/mocks/tauri-shell.ts'),
      '@tauri-apps/plugin-dialog': path.resolve(__dirname, './src/test/mocks/tauri-dialog.ts'),
      '@tauri-apps/plugin-fs': path.resolve(__dirname, './src/test/mocks/tauri-fs.ts'),
      'tauri-pty': path.resolve(__dirname, './src/test/mocks/pty.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'src/test',
        '**/*.d.ts',
        '**/*.config.*',
        'e2e',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
