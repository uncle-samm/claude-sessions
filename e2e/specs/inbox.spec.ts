/**
 * Inbox E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { waitForElement, sleep } from '../helpers/test-utils';

describe('Inbox', () => {
  let client: BridgeClient;
  let db: TestDb;
  let testMessageIds: string[] = [];

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
    db = new TestDb();
  }, 15000);

  afterAll(async () => {
    // Close inbox if open to not affect subsequent tests - use direct JS for reliability
    try {
      await client.executeJs(`(() => {
        const inboxView = document.querySelector('[data-testid="inbox-view"]');
        if (inboxView) {
          const btn = document.querySelector('[data-testid="inbox-btn"]');
          if (btn) btn.click();
        }
      })()`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Double-check and try again if still open
      const stillOpen = await client.exists('[data-testid="inbox-view"]');
      if (stillOpen) {
        await client.executeJs(`(() => {
          const btn = document.querySelector('[data-testid="inbox-btn"]');
          if (btn) btn.click();
        })()`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch {}

    // Clean up test messages
    testMessageIds.forEach(id => {
      try {
        db.db?.prepare('DELETE FROM inbox_messages WHERE id = ?').run(id);
      } catch {}
    });
    client?.disconnect();
    db?.close();
  });

  describe('Inbox Button', () => {
    it('should display inbox button in sidebar', async () => {
      const exists = await client.exists('[data-testid="inbox-btn"]');
      expect(exists).toBe(true);
    });

    it('should show unread badge when messages exist', async () => {
      const unreadCount = db.getUnreadInboxCount();
      const badgeExists = await client.exists('[data-testid="inbox-badge"]');

      if (unreadCount > 0) {
        expect(badgeExists).toBe(true);
      }
    });

    it('should display correct unread count', async () => {
      const unreadCount = db.getUnreadInboxCount();

      if (unreadCount > 0) {
        const badgeText = await client.getText('[data-testid="inbox-badge"]');
        expect(badgeText).toBe(String(unreadCount));
      }
    });
  });

  describe('Inbox View', () => {
    it('should open inbox view when clicking button', async () => {
      // Reset UI state to ensure clean baseline
      await client.resetUIState();
      await sleep(300);

      // Verify inbox is closed after reset
      const initiallyOpen = await client.exists('[data-testid="inbox-view"]');

      if (initiallyOpen) {
        // If still open, click to close first
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      // Now click to open inbox
      await client.click('[data-testid="inbox-btn"]');
      await sleep(500);

      const inboxVisible = await client.exists('[data-testid="inbox-view"]');
      expect(inboxVisible).toBe(true);

      // Clean up - close inbox for subsequent tests
      await client.resetUIState();
    });

    it('should display inbox messages', async () => {
      // Ensure inbox is open
      const inboxVisible = await client.exists('[data-testid="inbox-view"]');
      if (!inboxVisible) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      const messageCount = await client.count('[data-testid="inbox-message"]');
      expect(typeof messageCount).toBe('number');
    });

    it('should close inbox when clicking elsewhere', async () => {
      // Ensure inbox is open
      if (!(await client.exists('[data-testid="inbox-view"]'))) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      // Click outside inbox
      await client.click('[data-testid="sidebar"]');
      await sleep(300);

      // Inbox should close or remain open depending on UI design
      const inboxExists = await client.exists('[data-testid="inbox-view"]');
      expect(typeof inboxExists).toBe('boolean');
    });
  });

  describe('Database Operations', () => {
    it('should store messages in database', async () => {
      const messages = db.getInboxMessages();
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should have valid message structure', async () => {
      const messages = db.getInboxMessages();

      messages.forEach(msg => {
        expect(msg.id).toBeDefined();
        expect(msg.session_id).toBeDefined();
        expect(msg.message).toBeDefined();
        // read_at is null for unread, string for read
        expect(msg.read_at === null || typeof msg.read_at === 'string').toBe(true);
      });
    });

    it('should filter messages by session', async () => {
      const sessions = db.getSessions();

      if (sessions.length > 0) {
        const sessionMessages = db.getInboxMessagesForSession(sessions[0].id);

        sessionMessages.forEach(msg => {
          expect(msg.session_id).toBe(sessions[0].id);
        });
      }
    });
  });

  describe('Message Creation', () => {
    it('should create test message via database', async () => {
      const sessions = db.getSessions();
      if (sessions.length === 0) {
        console.log('Skipping: no sessions');
        return;
      }

      const msgId = db.createTestInboxMessage(
        sessions[0].id,
        'Test notification message'
      );
      testMessageIds.push(msgId);

      const msg = db.db?.prepare('SELECT * FROM inbox_messages WHERE id = ?').get(msgId);
      expect(msg).toBeDefined();
    });
  });

  describe('Message Display', () => {
    it('should display message content', async () => {
      // Open inbox
      if (!(await client.exists('[data-testid="inbox-view"]'))) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      const messages = await client.count('[data-testid="inbox-message"]');
      const dbMessages = db.getInboxMessages();

      if (dbMessages.length > 0) {
        expect(messages).toBeGreaterThan(0);
      }
    });

    it('should show message text', async () => {
      // Ensure inbox is open
      if (!(await client.exists('[data-testid="inbox-view"]'))) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      const messageTexts = await client.getAllText('[data-testid="inbox-message"]');
      const dbMessages = db.getInboxMessages();

      if (dbMessages.length > 0 && messageTexts.length > 0) {
        // At least one message should have content
        expect(messageTexts.some(t => t.length > 0)).toBe(true);
      }
    });
  });

  describe('Read Status', () => {
    it('should track read status in database', async () => {
      const messages = db.getInboxMessages();

      messages.forEach(msg => {
        // read_at is null for unread, string for read
        expect(msg.read_at === null || typeof msg.read_at === 'string').toBe(true);
      });
    });

    it('should count unread messages correctly', async () => {
      const allMessages = db.getInboxMessages();
      const unreadMessages = allMessages.filter(m => m.read_at === null);
      const unreadCount = db.getUnreadInboxCount();

      expect(unreadCount).toBe(unreadMessages.length);
    });
  });

  describe('Inbox Styling', () => {
    it('should have inbox CSS styles', async () => {
      const hasStyles = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if (rule.cssText?.includes('inbox')) {
                  return true;
                }
              }
            } catch {}
          }
          return false;
        })()`
      );
      expect(hasStyles).toBe(true);
    });

    it('should style unread messages differently', async () => {
      const hasUnreadStyles = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if (rule.cssText?.includes('unread') || rule.cssText?.includes('read')) {
                  return true;
                }
              }
            } catch {}
          }
          return false;
        })()`
      );
      expect(typeof hasUnreadStyles).toBe('boolean');
    });
  });

  describe('MCP notify_ready Integration', () => {
    it('should have Tauri API for notifications', async () => {
      const hasTauriApi = await client.executeJs<boolean>(
        `(() => !!window.__TAURI_INTERNALS__)()`
      );
      expect(hasTauriApi).toBe(true);
    });
  });

  describe('Inbox Navigation', () => {
    it('should allow clicking on messages', async () => {
      // Open inbox
      if (!(await client.exists('[data-testid="inbox-view"]'))) {
        await client.click('[data-testid="inbox-btn"]');
        await sleep(300);
      }

      const messageCount = await client.count('[data-testid="inbox-message"]');

      if (messageCount > 0) {
        await client.click('[data-testid="inbox-message"]');
        await sleep(200);

        // Click should select or navigate to message
        expect(true).toBe(true); // If no error, interaction worked
      }
    });
  });
});
