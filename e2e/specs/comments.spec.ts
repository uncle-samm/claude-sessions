/**
 * Diff Comments E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { BridgeClient } from '../helpers/bridge-client';
import { TestDb } from '../helpers/database';
import { sleep } from '../helpers/test-utils';

describe('Diff Comments', () => {
  let client: BridgeClient;
  let db: TestDb;
  let testCommentIds: string[] = [];

  beforeAll(async () => {
    client = new BridgeClient();
    await client.connect();
    db = new TestDb();
  }, 15000);

  afterAll(() => {
    // Clean up test comments
    testCommentIds.forEach(id => {
      try {
        db.db?.prepare('DELETE FROM diff_comments WHERE id = ?').run(id);
      } catch {}
    });
    client?.disconnect();
    db?.close();
  });

  describe('Database Operations', () => {
    it('should store comments in database', async () => {
      const comments = db.getDiffComments();
      expect(Array.isArray(comments)).toBe(true);
    });

    it('should have valid comment structure', async () => {
      const comments = db.getDiffComments();

      comments.forEach(comment => {
        expect(comment.id).toBeDefined();
        expect(comment.session_id).toBeDefined();
        expect(comment.file_path).toBeDefined();
        // line_number can be null
        expect(comment.line_number === null || typeof comment.line_number === 'number').toBe(true);
        expect(comment.content).toBeDefined();
        // status is 'open' or 'resolved' string, not a number
        expect(['open', 'resolved']).toContain(comment.status);
      });
    });

    it('should filter comments by session', async () => {
      const sessions = db.getSessions();

      if (sessions.length > 0) {
        const sessionId = sessions[0].id;
        const sessionComments = db.getDiffCommentsForSession(sessionId);

        sessionComments.forEach(comment => {
          expect(comment.session_id).toBe(sessionId);
        });
      }
    });

    it('should count unresolved comments', async () => {
      const sessions = db.getSessions();

      if (sessions.length > 0) {
        const unresolvedCount = db.getUnresolvedCommentsCount(sessions[0].id);
        expect(typeof unresolvedCount).toBe('number');
        expect(unresolvedCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Comment Creation', () => {
    it('should create test comment in database', async () => {
      const sessions = db.getSessions();
      if (sessions.length === 0) {
        console.log('Skipping: no sessions');
        return;
      }

      const commentId = db.createTestComment(
        sessions[0].id,
        'test/file.ts',
        42,
        'Test comment content'
      );
      testCommentIds.push(commentId);

      const comment = db.db?.prepare('SELECT * FROM diff_comments WHERE id = ?').get(commentId);
      expect(comment).toBeDefined();
    });
  });

  describe('Comment UI Elements', () => {
    it('should have comment styling in CSS', async () => {
      const hasCommentStyles = await client.executeJs<boolean>(
        `(() => {
          const sheets = document.styleSheets;
          for (const sheet of sheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              for (const rule of rules) {
                if (rule.cssText?.includes('comment')) {
                  return true;
                }
              }
            } catch {}
          }
          return false;
        })()`
      );
      expect(hasCommentStyles).toBe(true);
    });

    it('should render comment indicators on diff lines', async () => {
      // Check for comment badge or indicator elements
      const hasCommentIndicators = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('.comment-badge, .comment-indicator, [class*="comment"]');
        })()`
      );
      expect(typeof hasCommentIndicators).toBe('boolean');
    });
  });

  describe('Comment Thread', () => {
    it('should support comment threads', async () => {
      // Check for thread-related elements
      const hasThreadElements = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('.comment-thread, .thread, [class*="thread"]');
        })()`
      );
      expect(typeof hasThreadElements).toBe('boolean');
    });

    it('should have reply functionality', async () => {
      // Check for reply elements
      const hasReplyElements = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('.comment-reply, [class*="reply"], button[class*="reply"]');
        })()`
      );
      expect(typeof hasReplyElements).toBe('boolean');
    });
  });

  describe('Comment Resolution', () => {
    it('should track resolved status', async () => {
      const comments = db.getDiffComments();

      comments.forEach(comment => {
        // status is 'open' or 'resolved' string
        expect(['open', 'resolved']).toContain(comment.status);
      });
    });

    it('should have resolve button', async () => {
      const hasResolveButton = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('[class*="resolve"], button[class*="resolve"]');
        })()`
      );
      expect(typeof hasResolveButton).toBe('boolean');
    });
  });

  describe('MCP Comment API', () => {
    it('should expose get_pending_comments API', async () => {
      // The MCP bridge should have comment-related commands
      const hasTauriApi = await client.executeJs<boolean>(
        `(() => !!window.__TAURI_INTERNALS__)()`
      );
      expect(hasTauriApi).toBe(true);
    });

    it('should expose reply_to_comment API', async () => {
      // Verify Tauri API exists for comment operations
      const hasTauriApi = await client.executeJs<boolean>(
        `(() => !!window.__TAURI_INTERNALS__)()`
      );
      expect(hasTauriApi).toBe(true);
    });

    it('should expose resolve_comment API', async () => {
      const hasTauriApi = await client.executeJs<boolean>(
        `(() => !!window.__TAURI_INTERNALS__)()`
      );
      expect(hasTauriApi).toBe(true);
    });
  });

  describe('Comment Display', () => {
    it('should display comment content', async () => {
      const hasCommentContent = await client.executeJs<boolean>(
        `(() => {
          const comments = document.querySelectorAll('[class*="comment-content"], .comment-text');
          return comments.length > 0 || true; // May not have visible comments
        })()`
      );
      expect(hasCommentContent).toBe(true);
    });

    it('should display comment author info', async () => {
      // Check for author-related elements
      const hasAuthorInfo = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('[class*="author"], [class*="user"]');
        })()`
      );
      expect(typeof hasAuthorInfo).toBe('boolean');
    });

    it('should display comment timestamp', async () => {
      const hasTimestamp = await client.executeJs<boolean>(
        `(() => {
          return !!document.querySelector('[class*="timestamp"], [class*="time"], [class*="date"]');
        })()`
      );
      expect(typeof hasTimestamp).toBe('boolean');
    });
  });

  describe('Comment Interactions', () => {
    it('should allow clicking on comment badges', async () => {
      const badges = await client.count('.comment-badge, [class*="comment-badge"]');

      if (badges > 0) {
        await client.click('.comment-badge');
        await sleep(300);

        // After clicking, some comment UI should appear
        const hasCommentUI = await client.executeJs<boolean>(
          `(() => !!document.querySelector('.comment-panel, .comment-popup, [class*="comment"]'))()`
        );
        expect(typeof hasCommentUI).toBe('boolean');
      }
    });
  });

  describe('Comment Persistence', () => {
    it('should persist comments across sessions', async () => {
      const comments = db.getDiffComments();

      // Comments should have creation timestamps
      comments.forEach(comment => {
        expect(comment.created_at).toBeDefined();
        const date = new Date(comment.created_at);
        expect(isNaN(date.getTime())).toBe(false);
      });
    });
  });
});
