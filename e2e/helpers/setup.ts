/**
 * Common test setup utilities
 */

import { BridgeClient } from './bridge-client';

/**
 * Ensure inbox is closed so sidebar elements are visible
 * Uses direct JavaScript execution for reliability
 */
export async function ensureInboxClosed(client: BridgeClient): Promise<void> {
  // Check if inbox is open and close it
  const isOpen = await client.executeJs<boolean>(`(() => {
    return !!document.querySelector('[data-testid="inbox-view"]');
  })()`);

  if (isOpen) {
    // Click the inbox button to close it
    await client.executeJs(`(() => {
      const inboxBtn = document.querySelector('[data-testid="inbox-btn"]');
      if (inboxBtn) {
        inboxBtn.click();
      }
    })()`);

    // Wait for animation
    await sleep(300);

    // Verify it's closed
    const stillOpen = await client.executeJs<boolean>(`(() => {
      return !!document.querySelector('[data-testid="inbox-view"]');
    })()`);

    if (stillOpen) {
      // Force close by clicking again
      await client.executeJs(`(() => {
        const btn = document.querySelector('[data-testid="inbox-btn"]');
        if (btn) btn.click();
      })()`);
      await sleep(300);
    }
  }
}

/**
 * Ensure a clean UI state for testing
 * - Closes inbox if open
 * - Closes any open modals
 * - Clears any temporary UI state
 */
export async function ensureCleanState(client: BridgeClient): Promise<void> {
  // Close inbox if open
  await ensureInboxClosed(client);

  // Close any modals by pressing Escape
  await client.executeJs(`(() => {
    // Press Escape to close any open modals/dialogs
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  })()`);
  await sleep(100);

  // Close any new session input that might be open
  await client.executeJs(`(() => {
    const input = document.querySelector('[data-testid="new-session-input"]');
    if (input) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
  })()`);
  await sleep(100);
}

/**
 * Wait for workspace list to be visible (confirms inbox is closed)
 */
export async function waitForWorkspaceList(client: BridgeClient, timeout = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const visible = await client.exists('[data-testid="workspace-list"]');
    if (visible) return true;

    // If not visible, inbox might be open - try to close it
    await ensureInboxClosed(client);
    await sleep(200);
  }
  return false;
}

/**
 * Sleep for a given duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
