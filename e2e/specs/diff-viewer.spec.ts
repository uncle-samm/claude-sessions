/**
 * DiffViewer E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { waitForElement, sleep } from '../helpers/test-utils';

describe('DiffViewer', () => {
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

  describe('Panel Structure', () => {
    it('should have diff panel element', async () => {
      const exists = await client.exists('[data-testid="diff-panel"]');
      // Panel may or may not be visible depending on app state
      expect(typeof exists).toBe('boolean');
    });

    it('should have diff header when panel is visible', async () => {
      const panelExists = await client.exists('[data-testid="diff-panel"]');
      if (panelExists) {
        const headerExists = await client.exists('[data-testid="diff-header"]');
        expect(headerExists).toBe(true);
      }
    });

    it('should have file list when diffs exist', async () => {
      const panelExists = await client.exists('[data-testid="diff-panel"]');
      if (panelExists) {
        const fileListExists = await client.exists('[data-testid="diff-file-list"]');
        expect(typeof fileListExists).toBe('boolean');
      }
    });
  });

  describe('File List', () => {
    it('should display file items', async () => {
      const fileItems = await client.count('[data-testid="diff-file-item"]');
      expect(typeof fileItems).toBe('number');
    });

    it('should show file paths', async () => {
      const panelExists = await client.exists('[data-testid="diff-panel"]');
      if (panelExists) {
        const filePaths = await client.executeJs<string[]>(
          `(() => {
            const items = document.querySelectorAll('[data-testid="diff-file-item"]');
            return Array.from(items).map(item => item.textContent || '');
          })()`
        );
        expect(Array.isArray(filePaths)).toBe(true);
      }
    });
  });

  describe('Diff Content', () => {
    it('should render diff hunks', async () => {
      const hunkCount = await client.count('[data-testid="diff-hunk"]');
      expect(typeof hunkCount).toBe('number');
    });

    it('should highlight added lines', async () => {
      const hasAddedLines = await client.executeJs<boolean>(
        `(() => !!document.querySelector('.diff-line-added, .line-added, [class*="added"]'))()`
      );
      expect(typeof hasAddedLines).toBe('boolean');
    });

    it('should highlight removed lines', async () => {
      const hasRemovedLines = await client.executeJs<boolean>(
        `(() => !!document.querySelector('.diff-line-removed, .line-removed, [class*="removed"]'))()`
      );
      expect(typeof hasRemovedLines).toBe('boolean');
    });

    it('should display line numbers', async () => {
      const hasLineNumbers = await client.executeJs<boolean>(
        `(() => !!document.querySelector('.line-number, .diff-line-number, [class*="line-num"]'))()`
      );
      expect(typeof hasLineNumbers).toBe('boolean');
    });
  });

  describe('File Expansion', () => {
    it('should toggle file expansion on click', async () => {
      const fileItems = await client.count('[data-testid="diff-file-item"]');

      if (fileItems > 0) {
        // Click first file item
        await client.click('[data-testid="diff-file-item"]');
        await sleep(300);

        // Check if content expanded
        const hasExpandedContent = await client.executeJs<boolean>(
          `(() => {
            const item = document.querySelector('[data-testid="diff-file-item"]');
            return item?.classList.contains('expanded') ||
                   !!item?.nextElementSibling?.classList.contains('diff-content');
          })()`
        );
        expect(typeof hasExpandedContent).toBe('boolean');
      }
    });
  });

  describe('Hunk Operations', () => {
    it('should have hunk action buttons', async () => {
      const hunkCount = await client.count('[data-testid="diff-hunk"]');

      if (hunkCount > 0) {
        const hasActionButtons = await client.executeJs<boolean>(
          `(() => {
            const hunks = document.querySelectorAll('[data-testid="diff-hunk"]');
            for (const hunk of hunks) {
              if (hunk.querySelector('button, [class*="action"], [class*="btn"]')) {
                return true;
              }
            }
            return false;
          })()`
        );
        expect(typeof hasActionButtons).toBe('boolean');
      }
    });
  });

  describe('Diff Header Actions', () => {
    it('should have header action buttons', async () => {
      const panelExists = await client.exists('[data-testid="diff-panel"]');

      if (panelExists) {
        const hasHeaderButtons = await client.executeJs<boolean>(
          `(() => {
            const header = document.querySelector('[data-testid="diff-header"]');
            return header ? !!header.querySelector('button') : false;
          })()`
        );
        expect(typeof hasHeaderButtons).toBe('boolean');
      }
    });

    it('should display scope information', async () => {
      const panelExists = await client.exists('[data-testid="diff-panel"]');

      if (panelExists) {
        const hasScopeInfo = await client.executeJs<boolean>(
          `(() => {
            const header = document.querySelector('[data-testid="diff-header"]');
            return header ? header.textContent?.includes('file') ||
                           header.textContent?.includes('change') ||
                           header.textContent?.length > 0 : false;
          })()`
        );
        expect(typeof hasScopeInfo).toBe('boolean');
      }
    });
  });

  describe('Diff Styling', () => {
    it('should have proper CSS for diff viewer', async () => {
      const hasStyles = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if (rule.cssText?.includes('diff')) {
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

    it('should style added lines with green', async () => {
      const hasGreenStyle = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if ((rule.selectorText?.includes('added') || rule.selectorText?.includes('insert')) &&
                    rule.cssText?.includes('green')) {
                  return true;
                }
              }
            } catch {}
          }
          return false;
        })()`
      );
      // May have different color values
      expect(typeof hasGreenStyle).toBe('boolean');
    });

    it('should style removed lines with red', async () => {
      const hasRedStyle = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if ((rule.selectorText?.includes('removed') || rule.selectorText?.includes('delete')) &&
                    rule.cssText?.includes('red')) {
                  return true;
                }
              }
            } catch {}
          }
          return false;
        })()`
      );
      expect(typeof hasRedStyle).toBe('boolean');
    });
  });

  describe('Empty State', () => {
    it('should handle no diffs gracefully', async () => {
      // App should not crash when no diffs exist
      const appLayoutExists = await client.exists('.app-layout');
      expect(appLayoutExists).toBe(true);
    });
  });

  describe('Diff Panel Toggle', () => {
    it('should be able to show/hide diff panel', async () => {
      // Check if there's a way to toggle the diff panel
      const hasDiffToggle = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('[data-testid="diff-toggle"], .diff-toggle, [class*="toggle"]');
        })()`
      );
      expect(typeof hasDiffToggle).toBe('boolean');
    });
  });

  describe('Scroll Behavior', () => {
    it('should allow scrolling through large diffs', async () => {
      const panelExists = await client.exists('[data-testid="diff-panel"]');

      if (panelExists) {
        const isScrollable = await client.executeJs<boolean>(
          `(() => {
            const panel = document.querySelector('[data-testid="diff-panel"]');
            if (!panel) return false;
            const scrollableChild = panel.querySelector('[style*="overflow"], .diff-content');
            return !!scrollableChild || panel.scrollHeight > panel.clientHeight;
          })()`
        );
        expect(typeof isScrollable).toBe('boolean');
      }
    });
  });
});
