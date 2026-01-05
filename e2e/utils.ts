/**
 * E2E Test Utilities
 *
 * These utilities are designed to be used with Tauri MCP tools for UI automation.
 * Tests are executed by Claude reading the test files and running steps via MCP tools.
 *
 * Database: ~/Library/Application Support/com.samb.claude-sessions/sessions.db
 * Tables: sessions, workspaces, inbox_messages, diff_comments
 */

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Database path for SQLite queries
 */
export const DB_PATH = "~/Library/Application\\ Support/com.samb.claude-sessions/sessions.db";

/**
 * SQL query templates for common operations
 */
export const SQL = {
  // Sessions
  getAllSessions: `SELECT * FROM sessions ORDER BY created_at DESC`,
  getSession: (id: string) => `SELECT * FROM sessions WHERE id = '${id}'`,
  getSessionByName: (name: string) => `SELECT * FROM sessions WHERE name = '${name}'`,
  getSessionCount: `SELECT COUNT(*) as count FROM sessions`,

  // Workspaces
  getAllWorkspaces: `SELECT * FROM workspaces ORDER BY name`,
  getWorkspace: (id: string) => `SELECT * FROM workspaces WHERE id = '${id}'`,
  getWorkspaceCount: `SELECT COUNT(*) as count FROM workspaces`,

  // Inbox
  getInboxMessages: `SELECT * FROM inbox_messages ORDER BY created_at DESC`,
  getUnreadCount: `SELECT COUNT(*) as count FROM inbox_messages WHERE read = 0`,

  // Diff comments
  getComments: (sessionId: string) => `SELECT * FROM diff_comments WHERE session_id = '${sessionId}'`,

  // Base commit
  getBaseCommit: (sessionId: string) => `SELECT base_commit FROM sessions WHERE id = '${sessionId}'`,
};

// ============================================================================
// UI SELECTORS (data-testid)
// ============================================================================

/**
 * Standard selectors for UI elements
 * Components should have data-testid attributes matching these
 */
export const SELECTORS = {
  // Sidebar
  sidebar: '[data-testid="sidebar"]',
  workspaceList: '[data-testid="workspace-list"]',
  workspaceItem: '[data-testid="workspace-item"]',
  sessionItem: '[data-testid="session-item"]',
  sessionName: '[data-testid="session-name"]',
  newSessionBtn: '[data-testid="new-session-btn"]',
  addWorkspaceBtn: '[data-testid="add-workspace-btn"]',
  inboxBtn: '[data-testid="inbox-btn"]',
  inboxBadge: '[data-testid="inbox-badge"]',
  busySpinner: '[data-testid="busy-spinner"]',

  // Chat
  chatContainer: '[data-testid="chat-container"]',
  messageList: '[data-testid="message-list"]',
  userMessage: '[data-testid="user-message"]',
  assistantMessage: '[data-testid="assistant-message"]',
  inputArea: '[data-testid="input-area"]',
  sendBtn: '[data-testid="send-btn"]',

  // Tool calls
  toolCall: '[data-testid="tool-call"]',
  toolCallRead: '[data-testid="tool-call-read"]',
  toolCallWrite: '[data-testid="tool-call-write"]',
  toolCallEdit: '[data-testid="tool-call-edit"]',
  toolCallBash: '[data-testid="tool-call-bash"]',
  toolCallGlob: '[data-testid="tool-call-glob"]',
  toolCallGrep: '[data-testid="tool-call-grep"]',

  // Permission dialog
  permissionDialog: '[data-testid="permission-dialog"]',
  permissionToolName: '[data-testid="permission-tool-name"]',
  permissionPreview: '[data-testid="permission-preview"]',
  permissionDenyBtn: '[data-testid="permission-deny-btn"]',
  permissionAllowBtn: '[data-testid="permission-allow-btn"]',
  permissionAlwaysBtn: '[data-testid="permission-always-btn"]',

  // Diff viewer
  diffPanel: '[data-testid="diff-panel"]',
  diffHeader: '[data-testid="diff-header"]',
  diffFileList: '[data-testid="diff-file-list"]',
  diffFileItem: '[data-testid="diff-file-item"]',
  diffHunk: '[data-testid="diff-hunk"]',
  diffAddedLine: '[data-testid="diff-added-line"]',
  diffRemovedLine: '[data-testid="diff-removed-line"]',
  diffToggleBtn: '[data-testid="diff-toggle-btn"]',

  // Settings
  settingsPanel: '[data-testid="settings-panel"]',
  permissionModeToggle: '[data-testid="permission-mode-toggle"]',
  thinkingToggle: '[data-testid="thinking-toggle"]',
  todoToggle: '[data-testid="todo-toggle"]',
  verboseToggle: '[data-testid="verbose-toggle"]',

  // Inbox view
  inboxView: '[data-testid="inbox-view"]',
  inboxMessage: '[data-testid="inbox-message"]',

  // Modals
  addWorkspaceModal: '[data-testid="add-workspace-modal"]',
  setupModal: '[data-testid="setup-modal"]',

  // Thinking & Todos
  thinkingBlock: '[data-testid="thinking-block"]',
  todoList: '[data-testid="todo-list"]',
  todoItem: '[data-testid="todo-item"]',

  // Code blocks
  codeBlock: '[data-testid="code-block"]',
  markdownContent: '[data-testid="markdown-content"]',
};

// ============================================================================
// TEST STEP HELPERS
// ============================================================================

/**
 * Test step templates - these describe the MCP tool calls to make
 */
export const STEPS = {
  /**
   * Wait for an element to appear
   * Use: tauri_webview_wait_for with type="selector"
   */
  waitFor: (selector: string, timeout = 5000) => ({
    tool: 'tauri_webview_wait_for',
    params: { type: 'selector', value: selector, timeout }
  }),

  /**
   * Click an element
   * Use: tauri_webview_interact with action="click"
   */
  click: (selector: string) => ({
    tool: 'tauri_webview_interact',
    params: { action: 'click', selector }
  }),

  /**
   * Double-click an element
   * Use: tauri_webview_interact with action="double-click"
   */
  doubleClick: (selector: string) => ({
    tool: 'tauri_webview_interact',
    params: { action: 'double-click', selector }
  }),

  /**
   * Type text into an input
   * Use: tauri_webview_keyboard with action="type"
   */
  type: (selector: string, text: string) => ({
    tool: 'tauri_webview_keyboard',
    params: { action: 'type', selector, text }
  }),

  /**
   * Press a key
   * Use: tauri_webview_keyboard with action="press"
   */
  pressKey: (key: string, modifiers?: string[]) => ({
    tool: 'tauri_webview_keyboard',
    params: { action: 'press', key, modifiers }
  }),

  /**
   * Take a screenshot
   * Use: tauri_webview_screenshot
   */
  screenshot: () => ({
    tool: 'tauri_webview_screenshot',
    params: {}
  }),

  /**
   * Find an element
   * Use: tauri_webview_find_element
   */
  findElement: (selector: string) => ({
    tool: 'tauri_webview_find_element',
    params: { selector }
  }),

  /**
   * Execute JavaScript in webview
   * Use: tauri_webview_execute_js
   */
  executeJs: (script: string) => ({
    tool: 'tauri_webview_execute_js',
    params: { script }
  }),

  /**
   * Query database
   * Use: Bash with sqlite3
   */
  queryDb: (sql: string) => ({
    tool: 'Bash',
    params: { command: `sqlite3 "${DB_PATH.replace(/\\ /g, ' ')}" "${sql}"` }
  }),

  /**
   * Scroll in an element
   * Use: tauri_webview_interact with action="scroll"
   */
  scroll: (selector: string, scrollY: number) => ({
    tool: 'tauri_webview_interact',
    params: { action: 'scroll', selector, scrollY }
  }),
};

// ============================================================================
// TEST RESULT INTERFACE
// ============================================================================

export interface TestResult {
  name: string;
  suite: string;
  passed: boolean;
  error?: string;
  duration?: number;
  screenshots?: string[];
}

export interface TestSuiteResult {
  suite: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  duration: number;
}

// ============================================================================
// JAVASCRIPT HELPERS (for tauri_webview_execute_js)
// ============================================================================

/**
 * JavaScript snippets to execute in the webview for complex verifications
 */
export const JS_HELPERS = {
  /**
   * Get text content of an element
   */
  getTextContent: (selector: string) => `
    (() => {
      const el = document.querySelector('${selector}');
      return el ? el.textContent : null;
    })()
  `,

  /**
   * Get element count
   */
  getElementCount: (selector: string) => `
    (() => {
      return document.querySelectorAll('${selector}').length;
    })()
  `,

  /**
   * Check if element is visible
   */
  isVisible: (selector: string) => `
    (() => {
      const el = document.querySelector('${selector}');
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    })()
  `,

  /**
   * Get input value
   */
  getInputValue: (selector: string) => `
    (() => {
      const el = document.querySelector('${selector}');
      return el ? el.value : null;
    })()
  `,

  /**
   * Check if element has class
   */
  hasClass: (selector: string, className: string) => `
    (() => {
      const el = document.querySelector('${selector}');
      return el ? el.classList.contains('${className}') : false;
    })()
  `,

  /**
   * Get all session names from sidebar
   */
  getSessionNames: () => `
    (() => {
      const sessions = document.querySelectorAll('[data-testid="session-name"]');
      return Array.from(sessions).map(el => el.textContent);
    })()
  `,

  /**
   * Get message count
   */
  getMessageCount: () => `
    (() => {
      const messages = document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]');
      return messages.length;
    })()
  `,

  /**
   * Check if permission dialog is visible
   */
  isPermissionDialogVisible: () => `
    (() => {
      const dialog = document.querySelector('[data-testid="permission-dialog"]');
      if (!dialog) return false;
      const style = window.getComputedStyle(dialog);
      return style.display !== 'none';
    })()
  `,

  /**
   * Get diff file count
   */
  getDiffFileCount: () => `
    (() => {
      return document.querySelectorAll('[data-testid="diff-file-item"]').length;
    })()
  `,
};

// ============================================================================
// COMMON TEST PATTERNS
// ============================================================================

/**
 * Common test patterns that combine multiple steps
 */
export const PATTERNS = {
  /**
   * Send a message in chat
   */
  sendMessage: (message: string) => [
    STEPS.waitFor(SELECTORS.inputArea),
    STEPS.type(SELECTORS.inputArea, message),
    STEPS.pressKey('Enter'),
    // Wait for response
    { tool: 'wait', params: { ms: 2000 } }, // Give Claude time to respond
  ],

  /**
   * Create a new session
   */
  createSession: (name: string) => [
    STEPS.click(SELECTORS.newSessionBtn),
    STEPS.waitFor(SELECTORS.setupModal),
    // Fill in details...
  ],

  /**
   * Open diff panel
   */
  openDiffPanel: () => [
    STEPS.click(SELECTORS.diffToggleBtn),
    STEPS.waitFor(SELECTORS.diffPanel),
  ],

  /**
   * Respond to permission dialog
   */
  allowPermission: () => [
    STEPS.waitFor(SELECTORS.permissionDialog),
    STEPS.pressKey('Enter'), // Allow once
  ],

  denyPermission: () => [
    STEPS.waitFor(SELECTORS.permissionDialog),
    STEPS.pressKey('Escape'), // Deny
  ],

  alwaysAllowPermission: () => [
    STEPS.waitFor(SELECTORS.permissionDialog),
    STEPS.pressKey('Enter', ['Meta']), // Cmd+Enter
  ],
};
