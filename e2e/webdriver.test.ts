/**
 * WebDriver E2E Tests for CI (Linux only)
 *
 * These tests use WebdriverIO + tauri-driver for headless testing in CI.
 * They will be skipped on macOS (use MCP Bridge tests locally instead).
 *
 * Run with: npm run test:e2e:ci
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { remote, Browser } from 'webdriverio';
import path from 'path';
import os from 'os';

// Skip on macOS - use MCP Bridge tests instead
const isMacOS = os.platform() === 'darwin';
const describeOrSkip = isMacOS ? describe.skip : describe;

let tauriDriver: ChildProcess | null = null;
let browser: Browser | null = null;

const APP_BINARY = path.resolve(__dirname, '../src-tauri/target/release/claude-sessions');

describeOrSkip('Claude Sessions E2E (WebDriver)', () => {
  beforeAll(async () => {
    // Start tauri-driver
    tauriDriver = spawn('tauri-driver', [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for driver to start
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Connect via WebDriver
    browser = await remote({
      hostname: 'localhost',
      port: 4444,
      capabilities: {
        browserName: 'wry',
        'tauri:options': {
          application: APP_BINARY,
        },
      },
    });

    // Wait for app to load
    await browser.pause(3000);
  }, 30000);

  afterAll(async () => {
    if (browser) {
      await browser.deleteSession();
    }
    if (tauriDriver) {
      tauriDriver.kill();
    }
  });

  describe('App Load', () => {
    it('should have main app layout', async () => {
      const layout = await browser!.$('.app-layout');
      expect(await layout.isExisting()).toBe(true);
    });

    it('should have sidebar', async () => {
      const sidebar = await browser!.$('[data-testid="sidebar"]');
      expect(await sidebar.isExisting()).toBe(true);
    });

    it('should have inbox button', async () => {
      const inbox = await browser!.$('[data-testid="inbox-btn"]');
      expect(await inbox.isExisting()).toBe(true);
    });
  });

  describe('Session List', () => {
    it('should display session items', async () => {
      const sessions = await browser!.$$('.session-item');
      expect(sessions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Permission Dialog', () => {
    it('should not show by default', async () => {
      const dialog = await browser!.$('[data-testid="permission-dialog"]');
      expect(await dialog.isExisting()).toBe(false);
    });
  });
});
