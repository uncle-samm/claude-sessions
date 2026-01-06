/**
 * Common Test Utilities for E2E Testing
 */

import { BridgeClient } from './bridge-client';

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_INTERVAL = 100;

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, interval = DEFAULT_INTERVAL, message = 'Condition' } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`${message} not met within ${timeout}ms`);
}

/**
 * Wait for an element to exist in the DOM
 */
export async function waitForElement(
  client: BridgeClient,
  selector: string,
  options: { timeout?: number; visible?: boolean } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT, visible = false } = options;

  await waitFor(
    async () => {
      if (visible) {
        return await client.isVisible(selector);
      }
      return await client.exists(selector);
    },
    { timeout, message: `Element "${selector}"` }
  );
}

/**
 * Wait for an element to disappear from the DOM
 */
export async function waitForElementToDisappear(
  client: BridgeClient,
  selector: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await waitFor(async () => !(await client.exists(selector)), {
    timeout,
    message: `Element "${selector}" to disappear`,
  });
}

/**
 * Wait for text to appear anywhere in an element
 */
export async function waitForText(
  client: BridgeClient,
  selector: string,
  text: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await waitFor(
    async () => {
      const content = await client.getText(selector);
      return content?.includes(text) ?? false;
    },
    { timeout, message: `Text "${text}" in "${selector}"` }
  );
}

/**
 * Wait for element count to match
 */
export async function waitForCount(
  client: BridgeClient,
  selector: string,
  expectedCount: number,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await waitFor(
    async () => {
      const count = await client.count(selector);
      return count === expectedCount;
    },
    { timeout, message: `Count of "${selector}" to be ${expectedCount}` }
  );
}

/**
 * Wait for element to have a specific class
 */
export async function waitForClass(
  client: BridgeClient,
  selector: string,
  className: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await waitFor(async () => await client.hasClass(selector, className), {
    timeout,
    message: `Element "${selector}" to have class "${className}"`,
  });
}

/**
 * Wait for element to not have a specific class
 */
export async function waitForNoClass(
  client: BridgeClient,
  selector: string,
  className: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = DEFAULT_TIMEOUT } = options;

  await waitFor(async () => !(await client.hasClass(selector, className)), {
    timeout,
    message: `Element "${selector}" to not have class "${className}"`,
  });
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or times out
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number } = {}
): Promise<T> {
  const { retries = 3, delay = 500 } = options;
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      if (i < retries - 1) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Click and wait for element to appear
 */
export async function clickAndWait(
  client: BridgeClient,
  clickSelector: string,
  waitSelector: string,
  options: { timeout?: number } = {}
): Promise<void> {
  await client.click(clickSelector);
  await waitForElement(client, waitSelector, options);
}

/**
 * Type into input and verify value
 */
export async function typeAndVerify(
  client: BridgeClient,
  selector: string,
  text: string
): Promise<void> {
  await client.type(selector, text);
  await waitFor(
    async () => {
      const value = await client.getValue(selector);
      return value === text;
    },
    { message: `Input value to be "${text}"` }
  );
}

/**
 * Clear an input field
 */
export async function clearInput(client: BridgeClient, selector: string): Promise<void> {
  await client.executeJs(
    `(() => { const el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if(el) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`
  );
}

/**
 * Get all data-testid values from matching elements
 */
export async function getAllTestIds(client: BridgeClient, prefix: string): Promise<string[]> {
  return client.executeJs<string[]>(
    `(() => Array.from(document.querySelectorAll('[data-testid^="${prefix}"]')).map(el => el.dataset.testid))()`
  );
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(client: BridgeClient, selector: string): Promise<void> {
  await client.executeJs(
    `(() => document.querySelector('${selector.replace(/'/g, "\\'")}')?.scrollIntoView({ behavior: 'instant', block: 'center' }))()`
  );
}

/**
 * Take a snapshot of element properties for comparison
 */
export async function getElementSnapshot(
  client: BridgeClient,
  selector: string
): Promise<{
  exists: boolean;
  visible: boolean;
  text: string | null;
  classes: string[];
}> {
  return client.executeJs(
    `(() => {
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return { exists: false, visible: false, text: null, classes: [] };
      const style = getComputedStyle(el);
      return {
        exists: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden',
        text: el.textContent,
        classes: Array.from(el.classList)
      };
    })()`
  );
}
