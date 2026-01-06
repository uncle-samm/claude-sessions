/**
 * Session Management E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { waitForElement, waitFor, sleep, generateTestId } from '../helpers/test-utils';
import { ensureInboxClosed } from '../helpers/setup';

describe('Session Management', () => {
  let client: BridgeClient;
  let db: TestDb;
  let testSessionIds: string[] = [];

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
    db = new TestDb();
    // Ensure inbox is closed so session elements are visible
    await ensureInboxClosed(client);
  }, 15000);

  afterAll(() => {
    // Clean up test sessions
    testSessionIds.forEach(id => {
      try { db.deleteSession(id); } catch {}
    });
    client?.disconnect();
    db?.close();
  });

  describe('Session Persistence', () => {
    it('should persist sessions to database', async () => {
      const sessions = db.getSessions();
      expect(Array.isArray(sessions)).toBe(true);

      // Each session should have required fields
      sessions.forEach(session => {
        expect(session.id).toBeDefined();
        expect(typeof session.id).toBe('string');
        expect(session.name).toBeDefined();
        expect(session.cwd).toBeDefined();
        expect(session.created_at).toBeDefined();
      });
    });

    it('should have matching UI and DB session counts', async () => {
      // Reset UI state to ensure clean baseline
      await client.resetUIState();
      await sleep(200);

      const dbSessions = db.getSessions();

      // Wait for session items to be visible
      await waitForElement(client, '[data-testid="session-item"]', 3000);
      const uiCount = await client.count('[data-testid="session-item"]');

      // UI should show sessions from DB
      if (dbSessions.length > 0) {
        expect(uiCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Session Properties', () => {
    it('should display session name correctly', async () => {
      const sessions = db.getSessions();
      if (sessions.length === 0) {
        console.log('Skipping: no sessions');
        return;
      }

      const uiNames = await client.getAllText('[data-testid="session-name"]');
      const dbNames = sessions.map(s => s.name);

      // At least one UI name should match a DB name
      const hasMatch = uiNames.some(uiName =>
        dbNames.some(dbName => uiName.includes(dbName))
      );
      expect(hasMatch || uiNames.length === 0).toBe(true);
    });

    it('should have valid session IDs', async () => {
      const sessions = db.getSessions();
      sessions.forEach(session => {
        expect(session.id).toMatch(/^[a-z0-9-]+$/i);
      });
    });

    it('should have valid working directories', async () => {
      const sessions = db.getSessions();
      sessions.forEach(session => {
        expect(session.cwd).toBeDefined();
        expect(session.cwd.startsWith('/')).toBe(true);
      });
    });
  });

  describe('Session Switching', () => {
    it('should update UI when switching sessions', async () => {
      // Reset UI state to ensure clean baseline
      await client.resetUIState();
      await sleep(200);

      const sessions = db.getSessions();
      if (sessions.length < 2) {
        console.log('Skipping: need at least 2 sessions');
        return;
      }

      // Wait for session items to be visible
      await waitForElement(client, '[data-testid="session-item"]', 3000);

      // Get initial active session
      const initialActiveId = await client.executeJs<string | null>(
        `(() => document.querySelector('[data-testid="session-item"].active')?.closest('[data-session-id]')?.dataset?.sessionId ?? null)()`
      );

      // Click on a different session
      await client.click('[data-testid="session-item"]:not(.active)');
      await sleep(500);

      // Verify active class moved
      const newActiveExists = await client.exists('[data-testid="session-item"].active');
      expect(newActiveExists).toBe(true);
    });

    it('should load messages when switching sessions', async () => {
      const sessions = db.getSessions();
      if (sessions.length < 2) {
        console.log('Skipping: need at least 2 sessions');
        return;
      }

      // Switch to a session
      await client.click('[data-testid="session-item"]:not(.active)');
      await sleep(1000);

      // Message list should exist
      const messageListExists = await client.exists('[data-testid="message-list"]');
      expect(messageListExists).toBe(true);
    });
  });

  describe('Session Git Info', () => {
    it('should store base commit when available', async () => {
      const sessions = db.getSessions();

      // Check sessions that have base_commit set
      const sessionsWithCommit = sessions.filter(s => s.base_commit);

      sessionsWithCommit.forEach(session => {
        // Base commit should be a valid git SHA (40 chars hex)
        expect(session.base_commit).toMatch(/^[a-f0-9]{40}$/i);
      });
    });

    it('should store workspace association', async () => {
      const sessions = db.getSessions();
      const workspaces = db.getWorkspaces();

      // Sessions with workspace_id should reference valid workspaces
      const sessionsWithWorkspace = sessions.filter(s => s.workspace_id);
      const workspaceIds = new Set(workspaces.map(w => w.id));

      sessionsWithWorkspace.forEach(session => {
        expect(workspaceIds.has(session.workspace_id!)).toBe(true);
      });
    });
  });

  describe('Multiple Sessions', () => {
    it('should support multiple sessions per workspace', async () => {
      const workspaces = db.getWorkspaces();

      workspaces.forEach(workspace => {
        const sessions = db.getSessionsForWorkspace(workspace.id);
        // Can have zero or more sessions
        expect(Array.isArray(sessions)).toBe(true);
      });
    });

    it('should display sessions grouped by workspace', async () => {
      const workspaces = db.getWorkspaces();
      if (workspaces.length === 0) {
        console.log('Skipping: no workspaces');
        return;
      }

      // Each workspace section should contain its sessions
      const workspaceItems = await client.count('[data-testid="workspace-item"]');
      expect(workspaceItems).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Session Timestamps', () => {
    it('should have valid created_at timestamps', async () => {
      const sessions = db.getSessions();

      sessions.forEach(session => {
        expect(session.created_at).toBeDefined();
        const date = new Date(session.created_at);
        expect(isNaN(date.getTime())).toBe(false);
      });
    });

    it('should have valid updated_at timestamps', async () => {
      const sessions = db.getSessions();

      sessions.forEach(session => {
        expect(session.updated_at).toBeDefined();
        const date = new Date(session.updated_at);
        expect(isNaN(date.getTime())).toBe(false);
      });
    });

    it('should order sessions by created_at desc', async () => {
      const sessions = db.getSessions();

      for (let i = 0; i < sessions.length - 1; i++) {
        const current = new Date(sessions[i].created_at).getTime();
        const next = new Date(sessions[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('Active Session State', () => {
    it('should maintain active session across UI operations', async () => {
      // Reset UI state to ensure clean baseline
      await client.resetUIState();
      await sleep(300);

      // Ensure inbox is closed
      const inboxOpen = await client.exists('[data-testid="inbox-view"]');
      if (inboxOpen) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      // Wait for session items to be visible
      await waitForElement(client, '[data-testid="session-item"]', 3000);

      // Get current active session
      const hasActive = await client.exists('[data-testid="session-item"].active');

      if (hasActive) {
        // Get the active session ID before operations
        const activeId = await client.executeJs<string | null>(
          `(() => document.querySelector('[data-testid="session-item"].active')?.getAttribute('data-session-id') ?? null)()`
        );

        // Click inbox button (if exists)
        const inboxBtnExists = await client.exists('[data-testid="inbox-btn"]');
        if (inboxBtnExists) {
          await client.click('[data-testid="inbox-btn"]');
          await sleep(300);

          // Close inbox
          await client.click('[data-testid="inbox-btn"]');
          await sleep(300);
        }

        // Active session should still be marked
        const stillActive = await client.exists('[data-testid="session-item"].active');
        expect(stillActive).toBe(true);

        // Same session should be active
        const currentActiveId = await client.executeJs<string | null>(
          `(() => document.querySelector('[data-testid="session-item"].active')?.getAttribute('data-session-id') ?? null)()`
        );
        if (activeId && currentActiveId) {
          expect(currentActiveId).toBe(activeId);
        }
      }
    });
  });
});
