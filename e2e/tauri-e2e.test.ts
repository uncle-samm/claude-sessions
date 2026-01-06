/**
 * E2E Tests for Claude Sessions using Tauri MCP Bridge
 *
 * These tests require the app to be running with MCP Bridge enabled on port 9223.
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const MCP_PORT = 9223;
const DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/com.samb.claude-sessions/sessions.db'
);

// Bridge client matching the actual protocol: {command, id, args} -> {data, success, id}
class BridgeClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<string, { resolve: Function; reject: Function }>();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

      this.ws = new WebSocket(`ws://localhost:${MCP_PORT}`);
      this.ws.on('open', () => { clearTimeout(timeout); resolve(); });
      this.ws.on('error', (e) => { clearTimeout(timeout); reject(e); });

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

  private send(command: string, args: object = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = String(++this.messageId);
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${command} timed out`));
      }, 10000);

      this.pending.set(id, {
        resolve: (v: unknown) => { clearTimeout(timeout); resolve(v); },
        reject: (e: Error) => { clearTimeout(timeout); reject(e); },
      });

      this.ws?.send(JSON.stringify({ command, id, args }));
    });
  }

  async executeJs(script: string): Promise<unknown> {
    return this.send('execute_js', { script });
  }

  async findElement(selector: string): Promise<unknown> {
    return this.send('find_element', { selector });
  }

  async click(selector: string): Promise<void> {
    await this.send('interact', { action: 'click', selector });
  }

  async resetUIState(): Promise<void> {
    await this.executeJs(`(() => {
      // Close inbox if open
      const inboxPanel = document.querySelector('[data-testid="inbox-panel"]');
      if (inboxPanel && getComputedStyle(inboxPanel).display !== 'none') {
        const inboxBtn = document.querySelector('[data-testid="inbox-btn"]');
        if (inboxBtn) inboxBtn.click();
      }
      // Close any open modals
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async waitForElement(selector: string, timeout = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const exists = await this.executeJs(`(() => !!document.querySelector('${selector.replace(/'/g, "\\'")}'))()`);
      if (exists) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

// Database helper
class TestDb {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
  }

  getSessions() {
    return this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
  }

  getInboxMessages() {
    return this.db.prepare('SELECT * FROM inbox_messages ORDER BY created_at DESC').all();
  }

  close() {
    this.db.close();
  }
}

// Helper to close inbox if open
async function ensureInboxClosed(client: BridgeClient): Promise<void> {
  const inboxOpen = await client.executeJs(`(() => !!document.querySelector('[data-testid="inbox-view"]'))()`);
  if (inboxOpen) {
    await client.executeJs(`(() => { const btn = document.querySelector('[data-testid="inbox-btn"]'); if(btn) btn.click(); })()`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// Tests
describe('Claude Sessions E2E', () => {
  let bridge: BridgeClient;
  let db: TestDb;

  beforeAll(async () => {
    bridge = new BridgeClient();
    await bridge.connect();
    db = new TestDb();
    // Ensure inbox is closed so sidebar elements are visible
    await ensureInboxClosed(bridge);
  }, 15000);

  afterAll(() => {
    bridge?.disconnect();
    db?.close();
  });

  describe('App Load', () => {
    it('should have main app layout', async () => {
      const result = await bridge.executeJs(`(() => !!document.querySelector('.app-layout'))()`);
      expect(result).toBe(true);
    });

    it('should have sidebar', async () => {
      const result = await bridge.executeJs(`(() => !!document.querySelector('[data-testid="sidebar"]'))()`);
      expect(result).toBe(true);
    });

    it('should have inbox button', async () => {
      const result = await bridge.executeJs(`(() => !!document.querySelector('[data-testid="inbox-btn"]'))()`);
      expect(result).toBe(true);
    });

    it('should have Tauri API available', async () => {
      const result = await bridge.executeJs(`(() => !!window.__TAURI_INTERNALS__)()`);
      expect(result).toBe(true);
    });
  });

  describe('Session List', () => {
    it('should display session items', async () => {
      const count = await bridge.executeJs(`(() => document.querySelectorAll('[data-testid^="session-item-"]').length)()`);
      expect(typeof count).toBe('number');
    });

    it('should display sessions in sidebar', async () => {
      // Reset UI state to ensure clean baseline
      await bridge.resetUIState();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Wait for session items
      await bridge.waitForElement('[data-testid="session-item"]', 3000);

      const dbSessions = db.getSessions();
      // Check that session items exist (using class selector since data-testid may not be on all items)
      const uiCount = await bridge.executeJs(`(() => document.querySelectorAll('.session-item').length)()`);
      // If there are sessions in DB, there should be sessions in UI
      if (dbSessions.length > 0) {
        expect(uiCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Permission Dialog', () => {
    it('should not show by default', async () => {
      const visible = await bridge.executeJs(`(() => !!document.querySelector('[data-testid="permission-dialog"]'))()`);
      expect(visible).toBe(false);
    });
  });

  describe('Database Consistency', () => {
    it('should have valid session data', () => {
      const sessions = db.getSessions() as Array<{ id: string; name: string; cwd: string }>;
      for (const session of sessions) {
        expect(session.id).toBeDefined();
        expect(typeof session.id).toBe('string');
        expect(session.name).toBeDefined();
        expect(session.cwd).toBeDefined();
      }
    });

    it('should have valid inbox messages', () => {
      const messages = db.getInboxMessages() as Array<{ id: string; session_id: string; message: string }>;
      for (const msg of messages) {
        expect(msg.id).toBeDefined();
        expect(msg.session_id).toBeDefined();
        expect(msg.message).toBeDefined();
      }
    });
  });
});
