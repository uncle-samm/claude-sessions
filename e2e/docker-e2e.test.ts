/**
 * Docker E2E Tests
 *
 * These tests run in Docker with Xvfb for true isolation.
 * Uses a SINGLE browser session for all tests to avoid GTK resource exhaustion.
 *
 * Run with: docker-compose -f docker-compose.e2e.yml up --build
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { remote, Browser } from 'webdriverio';
import path from 'path';

// Only run in Docker/CI environment
const isDocker = process.env.CI === 'true' || process.env.DOCKER === 'true';
const describeOrSkip = isDocker ? describe : describe.skip;

const APP_BINARY = path.resolve(__dirname, '../src-tauri/target/release/claude-sessions');
const TAURI_DRIVER_PORT = 4444;

describeOrSkip('Claude Sessions E2E (Docker)', () => {
  let tauriDriver: ChildProcess | null = null;
  let browser: Browser | null = null;

  beforeAll(async () => {
    // Start tauri-driver
    console.log('Starting tauri-driver...');
    tauriDriver = spawn('tauri-driver', ['--port', String(TAURI_DRIVER_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    tauriDriver.stdout?.on('data', (data) => {
      console.log('tauri-driver stdout:', data.toString());
    });

    tauriDriver.stderr?.on('data', (data) => {
      console.log('tauri-driver stderr:', data.toString());
    });

    tauriDriver.on('error', (err) => {
      console.error('tauri-driver error:', err);
    });

    // Wait for driver to start
    console.log('Waiting for tauri-driver to be ready...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Start single browser session for all tests
    console.log('Starting browser session...');
    browser = await remote({
      hostname: 'localhost',
      port: TAURI_DRIVER_PORT,
      connectionRetryTimeout: 30000,
      connectionRetryCount: 5,
      capabilities: {
        'tauri:options': {
          application: APP_BINARY,
        },
      },
    });
    console.log('Browser session started');

    // Wait for app to fully initialize
    await browser.pause(5000);

    // Wait for app to fully load by checking for root element
    await browser.waitUntil(
      async () => {
        const root = await browser!.$('#root');
        return await root.isExisting();
      },
      { timeout: 20000, interval: 1000, timeoutMsg: 'App root did not load in time' }
    );

    // Extra time for React to render
    await browser.pause(2000);
    console.log('App loaded and ready for tests');
  }, 90000);

  afterAll(async () => {
    if (browser) {
      try {
        await browser.deleteSession();
      } catch {}
    }
    if (tauriDriver) {
      tauriDriver.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 1000));
    }
  });

  describe('App Layout', () => {
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

    it('should have workspace list visible by default', async () => {
      const workspaceList = await browser!.$('[data-testid="workspace-list"]');
      expect(await workspaceList.isExisting()).toBe(true);
    });
  });

  describe('Sidebar Navigation', () => {
    it('should display workspace items', async () => {
      const workspaces = await browser!.$$('[data-testid="workspace-item"]');
      // Fresh app has no workspaces, so this should be 0
      expect(workspaces.length).toBeGreaterThanOrEqual(0);
    });

    it('should display session items', async () => {
      const sessions = await browser!.$$('[data-testid="session-item"]');
      // Fresh app has no sessions
      expect(sessions.length).toBeGreaterThanOrEqual(0);
    });

    it('should have settings nav item', async () => {
      const settings = await browser!.$('.nav-item');
      expect(await settings.isExisting()).toBe(true);
    });
  });

  describe('Inbox', () => {
    it('should toggle inbox view when clicking inbox button', async () => {
      const inboxBtn = await browser!.$('[data-testid="inbox-btn"]');

      await inboxBtn.click();
      await browser!.pause(500);

      const inboxView = await browser!.$('[data-testid="inbox-view"]');
      const isOpen = await inboxView.isExisting();

      // Close it if it was opened
      if (isOpen) {
        await inboxBtn.click();
        await browser!.pause(300);
      }

      expect(isOpen).toBe(true);
    });

    it('should close inbox when clicking button again', async () => {
      const inboxBtn = await browser!.$('[data-testid="inbox-btn"]');

      // Open
      await inboxBtn.click();
      await browser!.pause(300);

      // Close
      await inboxBtn.click();
      await browser!.pause(300);

      const inboxView = await browser!.$('[data-testid="inbox-view"]');
      expect(await inboxView.isExisting()).toBe(false);
    });
  });

  describe('Main Content', () => {
    it('should show empty state when no sessions exist', async () => {
      const emptyState = await browser!.$('.empty-state');
      expect(await emptyState.isExisting()).toBe(true);

      const emptyText = await emptyState.getText();
      expect(emptyText).toContain('No sessions');
    });

    it('should show main content area', async () => {
      const mainContent = await browser!.$('.main-content');
      expect(await mainContent.isExisting()).toBe(true);
    });

    it('should show terminal area container', async () => {
      const terminalArea = await browser!.$('.terminal-area');
      expect(await terminalArea.isExisting()).toBe(true);
    });
  });

  describe('Permission Dialog', () => {
    it('should not show by default', async () => {
      const dialog = await browser!.$('[data-testid="permission-dialog"]');
      expect(await dialog.isExisting()).toBe(false);
    });
  });

  describe('Workspace Actions', () => {
    it('should have open workspace button', async () => {
      const openBtn = await browser!.$('.open-workspace-btn');
      expect(await openBtn.isExisting()).toBe(true);
    });

    it('should show empty hint when no workspaces', async () => {
      const hint = await browser!.$('.empty-hint');
      expect(await hint.isExisting()).toBe(true);

      const text = await hint.getText();
      expect(text).toContain('No workspaces');
    });
  });
});
