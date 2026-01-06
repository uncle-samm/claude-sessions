/**
 * Auth E2E Tests
 *
 * Tests authentication flow using password login (for E2E testing)
 * and verifies online/offline mode transitions.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { sleep, waitFor } from '../helpers/test-utils';

// Test account credentials
const TEST_EMAIL = 'e2e-test@claude-sessions.test';
const TEST_PASSWORD = 'TestPassword123!';

describe('Auth', () => {
  let client: BridgeClient;

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
  }, 15000);

  afterAll(() => {
    client?.disconnect();
  });

  describe('Anonymous/Offline Mode', () => {
    beforeEach(async () => {
      // Ensure signed out before each test
      await client.executeJs(`(async () => {
        if (window.__CLAUDE_SESSIONS_AUTH__) {
          const state = window.__CLAUDE_SESSIONS_AUTH__.getState();
          if (state.isAuthenticated) {
            await window.__CLAUDE_SESSIONS_AUTH__.signOut();
          }
        }
      })()`);
      await sleep(500);
    });

    it('should show offline mode indicator when not authenticated', async () => {
      // Open settings modal to see offline mode text
      await client.executeJs(`(() => {
        const settingsBtn = Array.from(document.querySelectorAll('*')).find(
          el => el.textContent === 'Settings' && el.childElementCount === 0
        );
        if (settingsBtn) settingsBtn.click();
      })()`);
      await sleep(300);

      const hasOfflineText = await client.executeJs<boolean>(`(() => {
        return document.body.textContent?.includes('offline mode') ?? false;
      })()`);
      expect(hasOfflineText).toBe(true);
    });

    it('should show Sign in with Google button', async () => {
      // Open settings modal
      await client.executeJs(`(() => {
        const settingsBtn = Array.from(document.querySelectorAll('*')).find(
          el => el.textContent === 'Settings' && el.childElementCount === 0
        );
        if (settingsBtn) settingsBtn.click();
      })()`);
      await sleep(300);

      const hasGoogleButton = await client.executeJs<boolean>(`(() => {
        return !!document.querySelector('.auth-btn.google');
      })()`);
      expect(hasGoogleButton).toBe(true);
    });

    it('should have auth API exposed for E2E tests', async () => {
      const hasAuthApi = await client.executeJs<boolean>(`(() => {
        return !!window.__CLAUDE_SESSIONS_AUTH__ &&
               typeof window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword === 'function';
      })()`);
      expect(hasAuthApi).toBe(true);
    });

    it('should report anonymous mode in auth state', async () => {
      const state = await client.executeJs<{ mode: string; isAuthenticated: boolean }>(`(() => {
        if (window.__CLAUDE_SESSIONS_AUTH__) {
          return window.__CLAUDE_SESSIONS_AUTH__.getState();
        }
        return { mode: 'unknown', isAuthenticated: false };
      })()`);
      expect(state.mode).toBe('anonymous');
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('Password Authentication', () => {
    it('should sign up with a new unique account', async () => {
      // Create a unique email for this test run
      const uniqueEmail = `e2e-signup-${Date.now()}@claude-sessions.test`;

      const signUpResult = await client.executeJs<{ success: boolean; email: string; error?: string }>(`(async () => {
        const email = '${uniqueEmail}';
        try {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            email,
            '${TEST_PASSWORD}',
            'signUp'
          );
          return { success: true, email };
        } catch (err) {
          return { success: false, email, error: String(err) };
        }
      })()`.replace(/\$\{uniqueEmail\}/g, uniqueEmail));

      expect(signUpResult.success).toBe(true);

      // Verify the user is now authenticated with the new email
      await sleep(500);
      const state = await client.executeJs<{ isAuthenticated: boolean; user: { email?: string } | null }>(`(() => {
        return window.__CLAUDE_SESSIONS_AUTH__.getState();
      })()`);

      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.email).toBe(uniqueEmail);

      // Sign out to clean up for next tests
      await client.executeJs(`(async () => {
        await window.__CLAUDE_SESSIONS_AUTH__.signOut();
      })()`);
      await sleep(500);
    });

    it('should sign up with password (reusable test account)', async () => {
      // First try to sign up (may fail if account exists)
      const signUpResult = await client.executeJs<{ success: boolean; error?: string }>(`(async () => {
        try {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            '${TEST_EMAIL}',
            '${TEST_PASSWORD}',
            'signUp'
          );
          return { success: true };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      })()`);

      // Either signup succeeds or account already exists
      expect(signUpResult.success || signUpResult.error?.includes('already')).toBe(true);
    });

    it('should sign in with password', async () => {
      const signInResult = await client.executeJs<{ success: boolean; error?: string }>(`(async () => {
        try {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            '${TEST_EMAIL}',
            '${TEST_PASSWORD}',
            'signIn'
          );
          return { success: true };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      })()`);

      expect(signInResult.success).toBe(true);
    });

    it('should transition to authenticated mode after sign in', async () => {
      // Sign in first
      await client.executeJs(`(async () => {
        await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
          '${TEST_EMAIL}',
          '${TEST_PASSWORD}',
          'signIn'
        );
      })()`);

      // Wait for auth state to update
      await waitFor(async () => {
        const state = await client.executeJs<{ isAuthenticated: boolean }>(`(() => {
          return window.__CLAUDE_SESSIONS_AUTH__?.getState() ?? { isAuthenticated: false };
        })()`);
        return state.isAuthenticated;
      }, { timeout: 5000, message: 'Auth state to become authenticated' });

      const state = await client.executeJs<{ mode: string; isAuthenticated: boolean }>(`(() => {
        return window.__CLAUDE_SESSIONS_AUTH__.getState();
      })()`);

      expect(state.mode).toBe('authenticated');
      expect(state.isAuthenticated).toBe(true);
    });

    it('should show user profile after authentication', async () => {
      // Ensure signed in
      await client.executeJs(`(async () => {
        const state = window.__CLAUDE_SESSIONS_AUTH__.getState();
        if (!state.isAuthenticated) {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            '${TEST_EMAIL}',
            '${TEST_PASSWORD}',
            'signIn'
          );
        }
      })()`);

      await sleep(1000);

      // Open settings modal
      await client.executeJs(`(() => {
        const settingsBtn = Array.from(document.querySelectorAll('*')).find(
          el => el.textContent === 'Settings' && el.childElementCount === 0
        );
        if (settingsBtn) settingsBtn.click();
      })()`);
      await sleep(300);

      // Check for sign out button (indicates authenticated state)
      const hasSignOutBtn = await client.executeJs<boolean>(`(() => {
        return !!document.querySelector('.sign-out-btn');
      })()`);
      expect(hasSignOutBtn).toBe(true);
    });

    it('should sign out successfully', async () => {
      // Ensure signed in first
      await client.executeJs(`(async () => {
        const state = window.__CLAUDE_SESSIONS_AUTH__.getState();
        if (!state.isAuthenticated) {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            '${TEST_EMAIL}',
            '${TEST_PASSWORD}',
            'signIn'
          );
        }
      })()`);
      await sleep(500);

      // Sign out
      await client.executeJs(`(async () => {
        await window.__CLAUDE_SESSIONS_AUTH__.signOut();
      })()`);

      // Wait for sign out to complete
      await waitFor(async () => {
        const state = await client.executeJs<{ isAuthenticated: boolean }>(`(() => {
          return window.__CLAUDE_SESSIONS_AUTH__?.getState() ?? { isAuthenticated: true };
        })()`);
        return !state.isAuthenticated;
      }, { timeout: 5000, message: 'Auth state to become unauthenticated' });

      const state = await client.executeJs<{ mode: string; isAuthenticated: boolean }>(`(() => {
        return window.__CLAUDE_SESSIONS_AUTH__.getState();
      })()`);

      expect(state.mode).toBe('anonymous');
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('Auth State Persistence', () => {
    it('should persist auth state across page operations', async () => {
      // Sign in
      await client.executeJs(`(async () => {
        await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
          '${TEST_EMAIL}',
          '${TEST_PASSWORD}',
          'signIn'
        );
      })()`);

      await sleep(1000);

      // Verify still authenticated after some operations
      const state = await client.executeJs<{ isAuthenticated: boolean }>(`(() => {
        return window.__CLAUDE_SESSIONS_AUTH__.getState();
      })()`);

      expect(state.isAuthenticated).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid credentials gracefully', async () => {
      const result = await client.executeJs<{ success: boolean; error?: string }>(`(async () => {
        try {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword(
            'invalid@test.com',
            'wrongpassword',
            'signIn'
          );
          return { success: true };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      })()`);

      // Should fail with invalid credentials
      expect(result.success).toBe(false);
    });

    it('should handle empty credentials', async () => {
      const result = await client.executeJs<{ success: boolean; error?: string }>(`(async () => {
        try {
          await window.__CLAUDE_SESSIONS_AUTH__.signInWithPassword('', '', 'signIn');
          return { success: true };
        } catch (err) {
          return { success: false, error: String(err) };
        }
      })()`);

      expect(result.success).toBe(false);
    });
  });
});
