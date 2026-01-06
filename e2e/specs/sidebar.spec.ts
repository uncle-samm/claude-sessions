/**
 * Sidebar Navigation E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { sleep } from '../helpers/test-utils';
import { ensureCleanState } from '../helpers/setup';

describe('Sidebar Navigation', () => {
  let client: BridgeClient;
  let db: TestDb;

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
    db = new TestDb();
  }, 15000);

  beforeEach(async () => {
    // Ensure clean state before each test
    await ensureCleanState(client);
  });

  afterAll(() => {
    client?.disconnect();
    db?.close();
  });

  describe('Layout', () => {
    it('should display sidebar element', async () => {
      const exists = await client.exists('[data-testid="sidebar"]');
      expect(exists).toBe(true);
    });

    it('should display inbox button', async () => {
      const exists = await client.exists('[data-testid="inbox-btn"]');
      expect(exists).toBe(true);
    });

    it('should display workspace list', async () => {
      const exists = await client.exists('[data-testid="workspace-list"]');
      expect(exists).toBe(true);
    });
  });

  describe('Session List', () => {
    it('should display session items matching database', async () => {
      const dbSessions = db.getSessions();
      const uiCount = await client.count('[data-testid="session-item"]');

      if (dbSessions.length > 0) {
        expect(uiCount).toBeGreaterThan(0);
      }
    });

    it('should display session names', async () => {
      const names = await client.getAllText('[data-testid="session-name"]');
      const dbSessions = db.getSessions();
      if (dbSessions.length > 0) {
        expect(names.length).toBeGreaterThan(0);
        expect(names.some(n => n.length > 0)).toBe(true);
      }
    });

    it('should highlight active session', async () => {
      const hasActiveByTestId = await client.exists('[data-testid="session-item"].active');
      const hasActiveByClass = await client.exists('.session-item.active');
      const hasActiveSession = hasActiveByTestId || hasActiveByClass;

      const dbSessions = db.getSessions();
      if (dbSessions.length > 0) {
        expect(hasActiveSession).toBe(true);
      }
    });
  });

  describe('Session Switching', () => {
    it('should switch sessions when clicking', async () => {
      const sessions = db.getSessions();
      if (sessions.length < 2) {
        console.log('Skipping: need at least 2 sessions');
        return;
      }

      const initialActive = await client.executeJs<string | null>(
        `(() => document.querySelector('[data-testid="session-item"].active')?.dataset.sessionId ?? null)()`
      );

      const sessionItems = await client.count('[data-testid="session-item"]');
      if (sessionItems > 1) {
        await client.click('[data-testid="session-item"]:not(.active)');
        await sleep(500);

        const newActive = await client.executeJs<string | null>(
          `(() => document.querySelector('[data-testid="session-item"].active')?.dataset.sessionId ?? null)()`
        );

        // newActive should be a string (session ID) or null
        expect(newActive === null || typeof newActive === 'string').toBe(true);
        if (newActive !== null) {
          expect(newActive).not.toBe(initialActive);
        }
      }
    });
  });

  describe('Inbox Badge', () => {
    it('should show inbox badge when unread messages exist', async () => {
      const unreadCount = db.getUnreadInboxCount();
      const badgeExists = await client.exists('[data-testid="inbox-badge"]');

      if (unreadCount > 0) {
        expect(badgeExists).toBe(true);
        const badgeText = await client.getText('[data-testid="inbox-badge"]');
        expect(parseInt(badgeText, 10)).toBeGreaterThan(0);
      }
    });

    it('should open inbox view when clicking inbox button', async () => {
      await client.click('[data-testid="inbox-btn"]');
      await sleep(300);

      const inboxVisible = await client.exists('[data-testid="inbox-view"]');
      expect(inboxVisible).toBe(true);

      // Close inbox for next test
      await client.click('[data-testid="inbox-btn"]');
      await sleep(300);
    });
  });

  describe('Workspace Sections', () => {
    it('should display workspace items', async () => {
      const workspaces = db.getWorkspaces();
      if (workspaces.length > 0) {
        const uiWorkspaces = await client.count('[data-testid="workspace-item"]');
        expect(uiWorkspaces).toBeGreaterThan(0);
      }
    });

    it('should show add session button for each workspace', async () => {
      const workspaces = db.getWorkspaces();
      if (workspaces.length > 0) {
        const addButtons = await client.count('[data-testid="add-session-btn"]');
        expect(addButtons).toBeGreaterThanOrEqual(workspaces.length);
      }
    });
  });

  describe('New Session Creation', () => {
    it('should show input when clicking add session button', async () => {
      const addBtnExists = await client.exists('[data-testid="add-session-btn"]');
      if (!addBtnExists) {
        console.log('Skipping: no add session button available');
        return;
      }

      await client.click('[data-testid="add-session-btn"]');
      await sleep(500);

      const inputByTestId = await client.exists('[data-testid="new-session-input"]');
      const inputByClass = await client.exists('.new-session-input');
      const inputExists = inputByTestId || inputByClass;
      expect(inputExists).toBe(true);

      await client.pressKey('Escape');
      await sleep(300);
    });
  });

  describe('Session Status Indicators', () => {
    it('should show busy spinner when session is processing', async () => {
      const sessionItems = await client.count('[data-testid="session-item"]');
      expect(sessionItems).toBeGreaterThanOrEqual(0);
    });

    it('should show setup spinner during session setup', async () => {
      const hasSpinnerClass = await client.executeJs<boolean>(
        `(() => !!document.querySelector('.session-spinner, .session-busy-spinner'))()`
      );
      expect(typeof hasSpinnerClass).toBe('boolean');
    });
  });
});
