import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', 'specs/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 15000,
    root: path.resolve(__dirname),
    // Run tests sequentially to avoid state conflicts
    sequence: {
      shuffle: false,
    },
    // Run spec files sequentially (not in parallel)
    fileParallelism: false,
    // Global setup to ensure clean state (only for MCP Bridge tests, not Docker)
    globalSetup: process.env.DOCKER ? undefined : './helpers/global-setup.ts',
  },
});
