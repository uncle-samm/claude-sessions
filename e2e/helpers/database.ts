/**
 * SQLite Database Helpers for E2E Testing
 *
 * Provides direct database access for test verification
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(
  os.homedir(),
  'Library/Application Support/com.samb.claude-sessions/sessions.db'
);

export interface Session {
  id: string;
  name: string;
  cwd: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  base_commit: string | null;
  conversation_id: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  folder: string;  // Note: column is 'folder' not 'path'
  script_path: string | null;
  origin_branch: string;
  created_at: string;
}

export interface InboxMessage {
  id: string;
  session_id: string;
  message: string;
  read_at: string | null;  // Note: column is 'read_at' not 'read'
  first_read_at: string | null;
  created_at: string;
}

export interface DiffComment {
  id: string;
  session_id: string;
  file_path: string;
  line_number: number | null;
  line_type: string | null;
  author: string;
  content: string;
  status: string;  // 'open' or 'resolved' - not a boolean
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export class TestDb {
  public db: Database.Database;

  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath);
  }

  // Session operations
  getSessions(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as Session[];
  }

  getSession(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  }

  getSessionByName(name: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE name = ?').get(name) as Session | undefined;
  }

  getSessionCount(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
    return result.count;
  }

  // Workspace operations
  getWorkspaces(): Workspace[] {
    return this.db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all() as Workspace[];
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Workspace | undefined;
  }

  getSessionsForWorkspace(workspaceId: string): Session[] {
    return this.db
      .prepare('SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC')
      .all(workspaceId) as Session[];
  }

  // Inbox operations
  getInboxMessages(): InboxMessage[] {
    return this.db
      .prepare('SELECT * FROM inbox_messages ORDER BY created_at DESC')
      .all() as InboxMessage[];
  }

  getInboxMessagesForSession(sessionId: string): InboxMessage[] {
    return this.db
      .prepare('SELECT * FROM inbox_messages WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId) as InboxMessage[];
  }

  getUnreadInboxCount(): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM inbox_messages WHERE read_at IS NULL')
      .get() as { count: number };
    return result.count;
  }

  // Comment operations
  getDiffComments(): DiffComment[] {
    return this.db
      .prepare('SELECT * FROM diff_comments ORDER BY created_at DESC')
      .all() as DiffComment[];
  }

  getDiffCommentsForSession(sessionId: string): DiffComment[] {
    return this.db
      .prepare('SELECT * FROM diff_comments WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId) as DiffComment[];
  }

  getUnresolvedCommentsCount(sessionId: string): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM diff_comments WHERE session_id = ? AND status = 'open'")
      .get(sessionId) as { count: number };
    return result.count;
  }

  // Test data management
  /**
   * Create a test session for testing purposes
   */
  createTestSession(name: string, cwd: string, workspaceId?: string): string {
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        `INSERT INTO sessions (id, name, cwd, workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
      .run(id, name, cwd, workspaceId || null);
    return id;
  }

  /**
   * Create a test inbox message
   */
  createTestInboxMessage(sessionId: string, message: string): string {
    const id = `test-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        `INSERT INTO inbox_messages (id, session_id, message, created_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
      .run(id, sessionId, message);
    return id;
  }

  /**
   * Create a test comment
   */
  createTestComment(
    sessionId: string,
    filePath: string,
    lineNumber: number,
    content: string
  ): string {
    const id = `test-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.db
      .prepare(
        `INSERT INTO diff_comments (id, session_id, file_path, line_number, author, content, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'test', ?, 'open', datetime('now'), datetime('now'))`
      )
      .run(id, sessionId, filePath, lineNumber, content);
    return id;
  }

  /**
   * Delete all test data (sessions, messages, comments starting with 'test-')
   */
  clearTestData(): void {
    this.db.prepare("DELETE FROM diff_comments WHERE id LIKE 'test-%'").run();
    this.db.prepare("DELETE FROM inbox_messages WHERE id LIKE 'test-%'").run();
    this.db.prepare("DELETE FROM sessions WHERE id LIKE 'test-%'").run();
  }

  /**
   * Delete a specific session and its related data
   */
  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM diff_comments WHERE session_id = ?').run(id);
    this.db.prepare('DELETE FROM inbox_messages WHERE session_id = ?').run(id);
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  close(): void {
    this.db.close();
  }
}

export default TestDb;
