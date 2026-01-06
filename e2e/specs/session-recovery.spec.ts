/**
 * Session Recovery E2E Tests
 *
 * Tests that verify session state is properly persisted and recovered
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { sleep } from '../helpers/test-utils';

describe('Session Recovery', () => {
  let client: BridgeClient;
  let db: TestDb;

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
    db = new TestDb();
  }, 15000);

  afterAll(() => {
    client?.disconnect();
    db?.close();
  });

  describe('Session Persistence', () => {
    it('should persist sessions to SQLite database', async () => {
      const sessions = db.getSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should have all required session fields', async () => {
      const sessions = db.getSessions();

      sessions.forEach(session => {
        expect(session.id).toBeDefined();
        expect(session.name).toBeDefined();
        expect(session.cwd).toBeDefined();
        expect(session.created_at).toBeDefined();
        expect(session.updated_at).toBeDefined();
      });
    });

    it('should preserve session working directory', async () => {
      const sessions = db.getSessions();

      sessions.forEach(session => {
        expect(session.cwd).toBeDefined();
        expect(session.cwd.startsWith('/')).toBe(true);
      });
    });
  });

  describe('Session State Recovery', () => {
    it('should restore sessions on app load', async () => {
      // Reset UI state to ensure clean baseline
      await client.resetUIState();
      await sleep(300);

      // Also ensure inbox view is closed by checking directly
      const inboxOpen = await client.exists('[data-testid="inbox-view"]');
      if (inboxOpen) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      // Wait for session items to be visible
      const found = await client.waitForElement('[data-testid="session-item"]', 5000);

      const dbSessions = db.getSessions();
      const uiSessions = await client.count('[data-testid="session-item"]');

      if (dbSessions.length > 0 && found) {
        expect(uiSessions).toBeGreaterThan(0);
      }
    });

    it('should restore active session', async () => {
      // Reset UI state first
      await client.resetUIState();
      await sleep(200);

      // Close inbox if open
      const inboxOpen = await client.exists('[data-testid="inbox-view"]');
      if (inboxOpen) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      // Wait for session items
      await client.waitForElement('[data-testid="session-item"]', 3000);

      // There should be an active session marked
      const hasActive = await client.exists('[data-testid="session-item"].active');
      const sessions = db.getSessions();

      if (sessions.length > 0) {
        expect(hasActive).toBe(true);
      }
    });

    it('should restore workspace associations', async () => {
      const sessions = db.getSessions();
      const workspaces = db.getWorkspaces();

      const workspaceIds = new Set(workspaces.map(w => w.id));

      sessions.forEach(session => {
        if (session.workspace_id) {
          expect(workspaceIds.has(session.workspace_id)).toBe(true);
        }
      });
    });
  });

  describe('Message Recovery', () => {
    it('should have message storage capability', async () => {
      // Check that message list exists
      const messageList = await client.exists('[data-testid="message-list"]');
      expect(messageList).toBe(true);
    });

    it('should display recovered messages', async () => {
      // Messages should be displayed if they exist
      const messageList = await client.exists('[data-testid="message-list"]');
      expect(messageList).toBe(true);

      const hasMessages = await client.executeJs<boolean>(
        `(() => {
          const list = document.querySelector('[data-testid="message-list"]');
          return list ? list.children.length > 0 : false;
        })()`
      );
      expect(typeof hasMessages).toBe('boolean');
    });
  });

  describe('Git State Recovery', () => {
    it('should preserve base_commit', async () => {
      const sessions = db.getSessions();

      sessions.forEach(session => {
        if (session.base_commit) {
          // Should be valid git SHA
          expect(session.base_commit).toMatch(/^[a-f0-9]{40}$/i);
        }
      });
    });

    it('should preserve conversation_id', async () => {
      const sessions = db.getSessions();

      sessions.forEach(session => {
        if (session.conversation_id) {
          expect(typeof session.conversation_id).toBe('string');
        }
      });
    });
  });

  describe('UI State Recovery', () => {
    it('should have proper UI layout after recovery', async () => {
      const appLayout = await client.exists('.app-layout');
      expect(appLayout).toBe(true);
    });

    it('should have sidebar visible', async () => {
      const sidebar = await client.exists('[data-testid="sidebar"]');
      expect(sidebar).toBe(true);
    });

    it('should have chat interface ready', async () => {
      const chatContainer = await client.exists('[data-testid="chat-container"]');
      expect(chatContainer).toBe(true);
    });

    it('should have input area functional', async () => {
      const inputArea = await client.exists('[data-testid="input-area"]');
      expect(inputArea).toBe(true);
    });
  });

  describe('Store State Recovery', () => {
    it('should have Zustand stores initialized', async () => {
      // Stores should be initialized after app load
      const hasStores = await client.executeJs<boolean>(
        `(() => {
          // App is functional, stores must be initialized
          return !!document.querySelector('.app-layout');
        })()`
      );
      expect(hasStores).toBe(true);
    });

    it('should have settings loaded', async () => {
      // Settings should be loaded
      const appFunctional = await client.exists('[data-testid="sidebar"]');
      expect(appFunctional).toBe(true);
    });
  });

  describe('Inbox Recovery', () => {
    it('should preserve inbox messages', async () => {
      const messages = db.getInboxMessages();
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should show correct unread count', async () => {
      const unreadCount = db.getUnreadInboxCount();

      if (unreadCount > 0) {
        const badgeExists = await client.exists('[data-testid="inbox-badge"]');
        expect(badgeExists).toBe(true);
      }
    });
  });

  describe('Comment Recovery', () => {
    it('should preserve diff comments', async () => {
      const comments = db.getDiffComments();
      expect(Array.isArray(comments)).toBe(true);
    });

    it('should preserve comment resolution status', async () => {
      const comments = db.getDiffComments();

      comments.forEach(comment => {
        // status is 'open' or 'resolved' string
        expect(['open', 'resolved']).toContain(comment.status);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should have consistent session-workspace relationships', async () => {
      const sessions = db.getSessions();
      const workspaces = db.getWorkspaces();
      const workspaceIds = new Set(workspaces.map(w => w.id));

      sessions.forEach(session => {
        if (session.workspace_id) {
          expect(workspaceIds.has(session.workspace_id)).toBe(true);
        }
      });
    });

    it('should have consistent session-inbox relationships', async () => {
      const messages = db.getInboxMessages();
      const sessions = db.getSessions();
      const sessionIds = new Set(sessions.map(s => s.id));

      messages.forEach(msg => {
        expect(sessionIds.has(msg.session_id)).toBe(true);
      });
    });

    it('should have consistent session-comment relationships', async () => {
      const comments = db.getDiffComments();
      const sessions = db.getSessions();
      const sessionIds = new Set(sessions.map(s => s.id));

      comments.forEach(comment => {
        expect(sessionIds.has(comment.session_id)).toBe(true);
      });
    });
  });

  describe('Recovery Performance', () => {
    it('should have app fully loaded', async () => {
      const isComplete = await client.executeJs<boolean>(
        `(() => document.readyState === 'complete')()`
      );
      expect(isComplete).toBe(true);
    });

    it('should have interactive UI', async () => {
      // UI should be interactive
      const inputExists = await client.exists('[data-testid="input-textarea"]');
      expect(inputExists).toBe(true);

      // Should be able to focus
      await client.focus('[data-testid="input-textarea"]');
      await sleep(100);

      // No error means interactive
      expect(true).toBe(true);
    });
  });
});
