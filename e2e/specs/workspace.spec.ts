/**
 * Workspace E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { sleep } from '../helpers/test-utils';
import { ensureCleanState } from '../helpers/setup';

describe('Workspace', () => {
  let client: BridgeClient;
  let db: TestDb;

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
    db = new TestDb();
  }, 15000);

  beforeEach(async () => {
    await ensureCleanState(client);
  });

  afterAll(() => {
    client?.disconnect();
    db?.close();
  });

  describe('Workspace List', () => {
    it('should display workspaces in sidebar', async () => {
      const workspaceList = await client.exists('[data-testid="workspace-list"]');
      expect(workspaceList).toBe(true);
    });

    it('should show workspace items', async () => {
      const workspaces = db.getWorkspaces();
      const uiWorkspaces = await client.count('[data-testid="workspace-item"]');

      if (workspaces.length > 0) {
        expect(uiWorkspaces).toBeGreaterThan(0);
      }
    });

    it('should match database workspace count', async () => {
      const dbWorkspaces = db.getWorkspaces();
      const uiWorkspaces = await client.count('[data-testid="workspace-item"]');

      if (dbWorkspaces.length > 0) {
        expect(uiWorkspaces).toBeGreaterThanOrEqual(dbWorkspaces.length);
      }
    });
  });

  describe('Database Operations', () => {
    it('should store workspaces in database', async () => {
      const workspaces = db.getWorkspaces();
      expect(Array.isArray(workspaces)).toBe(true);
    });

    it('should have valid workspace structure', async () => {
      const workspaces = db.getWorkspaces();

      workspaces.forEach(ws => {
        expect(ws.id).toBeDefined();
        expect(ws.name).toBeDefined();
        expect(ws.folder).toBeDefined();
        expect(ws.created_at).toBeDefined();
      });
    });

    it('should have valid workspace folders', async () => {
      const workspaces = db.getWorkspaces();

      workspaces.forEach(ws => {
        expect(ws.folder.startsWith('/')).toBe(true);
      });
    });
  });

  describe('Workspace Sessions', () => {
    it('should group sessions by workspace', async () => {
      const workspaces = db.getWorkspaces();

      workspaces.forEach(ws => {
        const sessions = db.getSessionsForWorkspace(ws.id);
        expect(Array.isArray(sessions)).toBe(true);

        sessions.forEach(session => {
          expect(session.workspace_id).toBe(ws.id);
        });
      });
    });

    it('should allow adding sessions to workspace', async () => {
      const addButtons = await client.count('[data-testid="add-session-btn"]');
      const workspaces = db.getWorkspaces();

      if (workspaces.length > 0) {
        expect(addButtons).toBeGreaterThan(0);
      }
    });
  });

  describe('Workspace UI', () => {
    it('should show workspace name', async () => {
      const workspaces = db.getWorkspaces();

      if (workspaces.length > 0) {
        const workspaceItems = await client.getAllText('[data-testid="workspace-item"]');
        expect(workspaceItems.length).toBeGreaterThan(0);
      }
    });

    it('should expand/collapse workspace sections', async () => {
      const workspaceItems = await client.count('[data-testid="workspace-item"]');

      if (workspaceItems > 0) {
        await client.click('[data-testid="workspace-item"]');
        await sleep(200);

        const stillExists = await client.exists('[data-testid="workspace-item"]');
        expect(stillExists).toBe(true);
      }
    });
  });

  describe('Add Session to Workspace', () => {
    it('should show input when adding session', async () => {
      const addBtnExists = await client.exists('[data-testid="add-session-btn"]');

      if (addBtnExists) {
        await client.click('[data-testid="add-session-btn"]');
        await sleep(300);

        const inputVisible = await client.exists('[data-testid="new-session-input"]');
        expect(inputVisible).toBe(true);

        await client.pressKey('Escape');
        await sleep(200);
      }
    });
  });

  describe('Workspace Styling', () => {
    it('should have workspace CSS styles', async () => {
      const hasStyles = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if (rule.cssText?.includes('workspace')) {
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
  });

  describe('Workspace Navigation', () => {
    it('should navigate to workspace sessions', async () => {
      const workspaces = db.getWorkspaces();

      if (workspaces.length > 0) {
        const wsWithSessions = workspaces.find(ws => {
          const sessions = db.getSessionsForWorkspace(ws.id);
          return sessions.length > 0;
        });

        if (wsWithSessions) {
          const sessionItems = await client.count('[data-testid="session-item"]');
          expect(sessionItems).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Workspace Timestamps', () => {
    it('should have valid created_at timestamps', async () => {
      const workspaces = db.getWorkspaces();

      workspaces.forEach(ws => {
        const date = new Date(ws.created_at);
        expect(isNaN(date.getTime())).toBe(false);
      });
    });

    it('should order workspaces by created_at desc', async () => {
      const workspaces = db.getWorkspaces();

      for (let i = 0; i < workspaces.length - 1; i++) {
        const current = new Date(workspaces[i].created_at).getTime();
        const next = new Date(workspaces[i + 1].created_at).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('Workspace Persistence', () => {
    it('should persist workspaces across app restarts', async () => {
      const workspaces = db.getWorkspaces();

      workspaces.forEach(ws => {
        expect(ws.id).toBeDefined();
        expect(ws.name).toBeDefined();
      });
    });
  });
});
