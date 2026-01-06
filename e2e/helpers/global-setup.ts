/**
 * Global setup for E2E tests
 *
 * This runs once before all test files to ensure a clean state.
 */

import { BridgeClient } from './bridge-client';

export async function setup() {
  // Connect to app and ensure clean state
  const client = new BridgeClient();

  try {
    await client.connect();

    // Close inbox if open
    await client.executeJs(`(() => {
      const inboxView = document.querySelector('[data-testid="inbox-view"]');
      if (inboxView) {
        const inboxBtn = document.querySelector('[data-testid="inbox-btn"]');
        if (inboxBtn) inboxBtn.click();
      }
    })()`);

    // Wait for UI to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    // Close any modals
    await client.executeJs(`(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);

    await new Promise(resolve => setTimeout(resolve, 200));

  } catch (error) {
    console.warn('Global setup warning:', error);
  } finally {
    client.disconnect();
  }
}

export async function teardown() {
  // Cleanup after all tests
  const client = new BridgeClient();

  try {
    await client.connect();

    // Close inbox if open
    await client.executeJs(`(() => {
      const inboxView = document.querySelector('[data-testid="inbox-view"]');
      if (inboxView) {
        const inboxBtn = document.querySelector('[data-testid="inbox-btn"]');
        if (inboxBtn) inboxBtn.click();
      }
    })()`);

  } catch (error) {
    // Ignore cleanup errors
  } finally {
    client.disconnect();
  }
}
