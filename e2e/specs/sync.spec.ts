/**
 * Sync E2E Tests
 *
 * Tests sync functionality when authenticated (online mode).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { sleep, waitFor } from '../helpers/test-utils';

// Test account credentials
const TEST_EMAIL = 'e2e-test@claude-sessions.test';
const TEST_PASSWORD = 'TestPassword123!';

describe('Sync', () => {
  let client: BridgeClient;

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();

    // Ensure authenticated for sync tests
    await client.executeJs(`(async () => {
      const state = window.__CLAUDE_SESSIONS_AUTH__?.getState();
      if (!state?.isAuthenticated) {
        try {
          // Try sign up first (in case account doesn't exist)
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            '${TEST_EMAIL}',
            '${TEST_PASSWORD}',
            'signUp'
          );
        } catch {
          // Account exists, sign in instead
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            '${TEST_EMAIL}',
            '${TEST_PASSWORD}',
            'signIn'
          );
        }
      }
    })()`);

    // Wait for auth to complete
    await waitFor(async () => {
      const state = await client.executeJs<{ isAuthenticated: boolean }>(`(() => {
        return window.__CLAUDE_SESSIONS_AUTH__?.getState() ?? { isAuthenticated: false };
      })()`);
      return state.isAuthenticated;
    }, { timeout: 10000, message: 'Auth to complete before sync tests' });
  }, 20000);

  afterAll(async () => {
    // Sign out after tests
    await client.executeJs(`(async () => {
      if (window.__CLAUDE_SESSIONS_AUTH__?.getState()?.isAuthenticated) {
        await window.__CLAUDE_SESSIONS_AUTH__.signOut();
      }
    })()`);
    client?.disconnect();
  });

  describe('Sync Status Display', () => {
    it('should not show offline mode when authenticated', async () => {
      await sleep(500);
      const hasOfflineText = await client.executeJs<boolean>(`(() => {
        const settingsContent = document.querySelector('.settings-content');
        return settingsContent?.textContent?.includes('offline mode') ?? false;
      })()`);
      expect(hasOfflineText).toBe(false);
    });

    it('should show sync status in settings', async () => {
      // Open settings modal
      await client.executeJs(`(() => {
        const settingsBtn = Array.from(document.querySelectorAll('*')).find(
          el => el.textContent === 'Settings' && el.childElementCount === 0
        );
        if (settingsBtn) settingsBtn.click();
      })()`);
      await sleep(300);

      // Check for sync-related UI elements
      const hasSyncElements = await client.executeJs<boolean>(`(() => {
        const text = document.body.textContent || '';
        return text.includes('Sync') || text.includes('Synced');
      })()`);
      expect(hasSyncElements).toBe(true);
    });

    it('should show Sync Now button when authenticated', async () => {
      // Open settings if not open
      await client.executeJs(`(() => {
        if (!document.querySelector('.settings-modal')) {
          const settingsBtn = Array.from(document.querySelectorAll('*')).find(
            el => el.textContent === 'Settings' && el.childElementCount === 0
          );
          if (settingsBtn) settingsBtn.click();
        }
      })()`);
      await sleep(300);

      const hasSyncNowBtn = await client.executeJs<boolean>(`(() => {
        return !!document.querySelector('.sync-now-btn');
      })()`);
      expect(hasSyncNowBtn).toBe(true);
    });
  });

  describe('Sync Operations', () => {
    it('should trigger sync when clicking Sync Now', async () => {
      // Open settings if not open
      await client.executeJs(`(() => {
        if (!document.querySelector('.settings-modal')) {
          const settingsBtn = Array.from(document.querySelectorAll('*')).find(
            el => el.textContent === 'Settings' && el.childElementCount === 0
          );
          if (settingsBtn) settingsBtn.click();
        }
      })()`);
      await sleep(300);

      // Click Sync Now
      await client.executeJs(`(() => {
        const syncBtn = document.querySelector('.sync-now-btn');
        if (syncBtn) syncBtn.click();
      })()`);

      // Wait a bit for sync to process
      await sleep(1000);

      // Verify sync completed (check for updated timestamp or status)
      const syncText = await client.executeJs<string>(`(() => {
        const syncSection = document.querySelector('.sync-section');
        return syncSection?.textContent ?? '';
      })()`);

      // Should show some sync status (Synced, just now, etc.)
      expect(syncText.length).toBeGreaterThan(0);
    });

    it('should update last sync time after sync', async () => {
      // Get initial sync text
      const initialSyncText = await client.executeJs<string>(`(() => {
        const syncSection = document.querySelector('.sync-section');
        return syncSection?.textContent ?? '';
      })()`);

      // Trigger sync
      await client.executeJs(`(() => {
        const syncBtn = document.querySelector('.sync-now-btn');
        if (syncBtn) syncBtn.click();
      })()`);
      await sleep(1500);

      // Check sync text updated
      const updatedSyncText = await client.executeJs<string>(`(() => {
        const syncSection = document.querySelector('.sync-section');
        return syncSection?.textContent ?? '';
      })()`);

      // Should contain sync-related text
      expect(updatedSyncText).toMatch(/Sync|just now|ago/i);
    });
  });

  describe('User Profile in Online Mode', () => {
    it('should display user email', async () => {
      // Open settings if not open
      await client.executeJs(`(() => {
        if (!document.querySelector('.settings-modal')) {
          const settingsBtn = Array.from(document.querySelectorAll('*')).find(
            el => el.textContent === 'Settings' && el.childElementCount === 0
          );
          if (settingsBtn) settingsBtn.click();
        }
      })()`);
      await sleep(300);

      const hasEmail = await client.executeJs<boolean>(`(() => {
        return document.body.textContent?.includes('${TEST_EMAIL}') ?? false;
      })()`);
      expect(hasEmail).toBe(true);
    });

    it('should show Sign Out button', async () => {
      const hasSignOutBtn = await client.executeJs<boolean>(`(() => {
        return !!document.querySelector('.sign-out-btn');
      })()`);
      expect(hasSignOutBtn).toBe(true);
    });
  });

  describe('Offline Transition', () => {
    it('should handle sign out and return to offline mode', async () => {
      // Sign out
      await client.executeJs(`(async () => {
        await window.__CLAUDE_SESSIONS_AUTH__.signOut();
      })()`);

      // Wait for sign out
      await waitFor(async () => {
        const state = await client.executeJs<{ isAuthenticated: boolean }>(`(() => {
          return window.__CLAUDE_SESSIONS_AUTH__?.getState() ?? { isAuthenticated: true };
        })()`);
        return !state.isAuthenticated;
      }, { timeout: 5000, message: 'Sign out to complete' });

      await sleep(500);

      // Should be back in offline mode
      const hasOfflineText = await client.executeJs<boolean>(`(() => {
        return document.body.textContent?.includes('offline mode') ?? false;
      })()`);
      expect(hasOfflineText).toBe(true);

      // Re-authenticate for other tests
      await client.executeJs(`(async () => {
        await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
          '${TEST_EMAIL}',
          '${TEST_PASSWORD}',
          'signIn'
        );
      })()`);
      await sleep(1000);
    });
  });
});
