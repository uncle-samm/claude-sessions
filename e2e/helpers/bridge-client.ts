/**
 * MCP Bridge WebSocket Client for E2E Testing
 *
 * Protocol: {command, id, args} -> {data, success, id}
 * Connects to Tauri app via MCP Bridge on port 9223
 */

import WebSocket from 'ws';

const MCP_PORT = 9223;
const DEFAULT_TIMEOUT = 10000;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<string, { resolve: Function; reject: Function }>();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

      this.ws = new WebSocket(`ws://localhost:${MCP_PORT}`);
      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.ws.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.success) {
              p.resolve(msg.data);
            } else {
              p.reject(new Error(msg.error || 'Unknown error'));
            }
          }
        } catch {}
      });
    });
  }

  private send(command: string, args: object = {}, timeout = DEFAULT_TIMEOUT): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(++this.messageId);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${command} timed out`));
      }, timeout);

      this.pending.set(id, {
        resolve: (v: unknown) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      });

      this.ws?.send(JSON.stringify({ command, id, args }));
    });
  }

  /**
   * Execute JavaScript in the webview context
   */
  async executeJs<T = unknown>(script: string): Promise<T> {
    return this.send('execute_js', { script }) as Promise<T>;
  }

  /**
   * Find element by CSS selector
   */
  async findElement(selector: string): Promise<unknown> {
    return this.send('find_element', { selector });
  }

  /**
   * Click an element by CSS selector (uses JavaScript)
   */
  async click(selector: string): Promise<void> {
    await this.executeJs(
      `(() => { const el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if(el) el.click(); })()`
    );
  }

  /**
   * Double-click an element by CSS selector (uses JavaScript)
   */
  async doubleClick(selector: string): Promise<void> {
    await this.executeJs(
      `(() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if(el) {
          el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        }
      })()`
    );
  }

  /**
   * Type text into an element (uses JavaScript with React compatibility)
   */
  async type(selector: string, text: string): Promise<void> {
    await this.executeJs(
      `(() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if(el) {
          el.focus();
          // Use native value setter to work with React controlled inputs
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, '${text.replace(/'/g, "\\'")}');
          } else {
            el.value = '${text.replace(/'/g, "\\'")}';
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`
    );
  }

  /**
   * Press a key (Enter, Escape, etc.) - uses JavaScript
   */
  async pressKey(key: string, modifiers?: string[]): Promise<void> {
    const modObj = modifiers?.reduce((acc, m) => ({ ...acc, [`${m.toLowerCase()}Key`]: true }), {}) || {};
    await this.executeJs(
      `(() => {
        const event = new KeyboardEvent('keydown', {
          key: '${key}',
          code: '${key}',
          bubbles: true,
          cancelable: true,
          ${modifiers?.map(m => `${m.toLowerCase()}Key: true`).join(', ') || ''}
        });
        document.activeElement?.dispatchEvent(event);
        document.dispatchEvent(event);
      })()`
    );
  }

  /**
   * Scroll an element or the page (uses JavaScript)
   */
  async scroll(selector: string, scrollX: number, scrollY: number): Promise<void> {
    await this.executeJs(
      `(() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if(el) el.scrollBy(${scrollX}, ${scrollY});
      })()`
    );
  }

  /**
   * Check if an element exists
   */
  async exists(selector: string): Promise<boolean> {
    return this.executeJs<boolean>(`(() => !!document.querySelector('${selector.replace(/'/g, "\\'")}'))()`);
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string | null> {
    return this.executeJs<string | null>(
      `(() => document.querySelector('${selector.replace(/'/g, "\\'")}')?.textContent ?? null)()`
    );
  }

  /**
   * Get an attribute value from an element
   */
  async getAttribute(selector: string, attribute: string): Promise<string | null> {
    return this.executeJs<string | null>(
      `(() => document.querySelector('${selector.replace(/'/g, "\\'")}')?.getAttribute('${attribute}') ?? null)()`
    );
  }

  /**
   * Get the count of elements matching a selector
   */
  async count(selector: string): Promise<number> {
    return this.executeJs<number>(
      `(() => document.querySelectorAll('${selector.replace(/'/g, "\\'")}').length)()`
    );
  }

  /**
   * Get computed style property
   */
  async getStyle(selector: string, property: string): Promise<string | null> {
    return this.executeJs<string | null>(
      `(() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        return el ? getComputedStyle(el).${property} : null;
      })()`
    );
  }

  /**
   * Check if an element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    return this.executeJs<boolean>(
      `(() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      })()`
    );
  }

  /**
   * Get the value of an input element
   */
  async getValue(selector: string): Promise<string | null> {
    return this.executeJs<string | null>(
      `(() => document.querySelector('${selector.replace(/'/g, "\\'")}')?.value ?? null)()`
    );
  }

  /**
   * Focus an element (uses JavaScript)
   */
  async focus(selector: string): Promise<void> {
    await this.executeJs(
      `(() => { const el = document.querySelector('${selector.replace(/'/g, "\\'")}'); if(el) el.focus(); })()`
    );
  }

  /**
   * Check if an element has a specific class
   */
  async hasClass(selector: string, className: string): Promise<boolean> {
    return this.executeJs<boolean>(
      `(() => document.querySelector('${selector.replace(/'/g, "\\'")}')?.classList.contains('${className}') ?? false)()`
    );
  }

  /**
   * Get all text content from matching elements
   */
  async getAllText(selector: string): Promise<string[]> {
    return this.executeJs<string[]>(
      `(() => Array.from(document.querySelectorAll('${selector.replace(/'/g, "\\'")}')).map(el => el.textContent || ''))()`
    );
  }

  /**
   * Reset UI state to clean baseline for tests
   * - Closes inbox if open
   * - Closes any open modals
   * - Clears any active selections
   */
  async resetUIState(): Promise<void> {
    await this.executeJs(`(() => {
      // Close inbox if open (check for inbox panel visibility)
      const inboxPanel = document.querySelector('[data-testid="inbox-panel"]');
      if (inboxPanel && getComputedStyle(inboxPanel).display !== 'none') {
        const inboxBtn = document.querySelector('[data-testid="inbox-btn"]');
        if (inboxBtn) inboxBtn.click();
      }

      // Close any open modals by pressing Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      // Close any open dropdowns/context menus
      const dropdowns = document.querySelectorAll('[role="menu"], .dropdown-menu, .context-menu');
      dropdowns.forEach(d => d.remove());

      // Clear localStorage test artifacts (but preserve session data)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('test-')) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    })()`);

    // Small pause to let UI settle
    await this.wait(100);
  }

  /**
   * Wait for a specified duration (ms)
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for an element to exist
   */
  async waitForElement(selector: string, timeout = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.exists(selector)) return true;
      await this.wait(100);
    }
    return false;
  }

  /**
   * Wait for an element to be visible
   */
  async waitForVisible(selector: string, timeout = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.isVisible(selector)) return true;
      await this.wait(100);
    }
    return false;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

export default BridgeClient;
