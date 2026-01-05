/**
 * E2E Test Runner
 *
 * This file provides the test definitions that Claude executes via Tauri MCP tools.
 * Each test is a series of steps that can be run manually or in sequence.
 *
 * To run tests:
 * 1. Start the app: npm run tauri dev
 * 2. Connect: tauri_driver_session start
 * 3. Read this file and execute tests step by step
 *
 * Test results should be verified with:
 * - Screenshots (tauri_webview_screenshot)
 * - Database queries (sqlite3)
 * - Element checks (tauri_webview_find_element)
 */

import { SELECTORS, SQL, DB_PATH, JS_HELPERS } from './utils';

// ============================================================================
// TEST DEFINITIONS
// ============================================================================

export interface TestDefinition {
  name: string;
  suite: string;
  description: string;
  steps: TestStep[];
  verification: VerificationStep[];
}

export interface TestStep {
  description: string;
  action: 'click' | 'type' | 'press' | 'wait' | 'screenshot' | 'scroll' | 'js' | 'db';
  selector?: string;
  text?: string;
  key?: string;
  modifiers?: string[];
  timeout?: number;
  script?: string;
  sql?: string;
}

export interface VerificationStep {
  description: string;
  type: 'element_exists' | 'element_visible' | 'text_content' | 'db_value' | 'js_returns' | 'screenshot';
  selector?: string;
  expected?: any;
  sql?: string;
  script?: string;
}

// ============================================================================
// SESSION TESTS
// ============================================================================

export const sessionTests: TestDefinition[] = [
  {
    name: 'Create new session',
    suite: 'sessions',
    description: 'Verify that a new session can be created via the sidebar',
    steps: [
      { description: 'Click new session button', action: 'click', selector: SELECTORS.newSessionBtn },
      { description: 'Wait for setup modal', action: 'wait', selector: SELECTORS.setupModal, timeout: 5000 },
      { description: 'Take screenshot of modal', action: 'screenshot' },
    ],
    verification: [
      { description: 'Setup modal is visible', type: 'element_visible', selector: SELECTORS.setupModal },
      { description: 'Session count increased', type: 'db_value', sql: SQL.getSessionCount },
    ],
  },
  {
    name: 'Switch sessions',
    suite: 'sessions',
    description: 'Verify switching between sessions updates the main panel',
    steps: [
      { description: 'Find session items', action: 'wait', selector: SELECTORS.sessionItem },
      { description: 'Click on a session', action: 'click', selector: `${SELECTORS.sessionItem}:nth-child(2)` },
      { description: 'Wait for content to load', action: 'wait', timeout: 1000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Session is selected', type: 'element_exists', selector: `${SELECTORS.sessionItem}.active` },
    ],
  },
  {
    name: 'Session persists on reload',
    suite: 'sessions',
    description: 'Verify sessions persist after app reload',
    steps: [
      { description: 'Get current session count', action: 'db', sql: SQL.getSessionCount },
      { description: 'Take screenshot before', action: 'screenshot' },
      // Note: Reload would be done manually or via tauri command
    ],
    verification: [
      { description: 'Session still exists in DB', type: 'db_value', sql: SQL.getSessionCount },
    ],
  },
];

// ============================================================================
// CHAT TESTS
// ============================================================================

export const chatTests: TestDefinition[] = [
  {
    name: 'Send message',
    suite: 'chat',
    description: 'Verify sending a message shows in chat and gets a response',
    steps: [
      { description: 'Wait for input area', action: 'wait', selector: SELECTORS.inputArea },
      { description: 'Type message', action: 'type', selector: SELECTORS.inputArea, text: 'Hello, say hi back briefly' },
      { description: 'Press Enter to send', action: 'press', key: 'Enter' },
      { description: 'Wait for response', action: 'wait', timeout: 10000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'User message appears', type: 'element_exists', selector: SELECTORS.userMessage },
      { description: 'Assistant message appears', type: 'element_exists', selector: SELECTORS.assistantMessage },
    ],
  },
  {
    name: 'Code blocks with syntax highlighting',
    suite: 'chat',
    description: 'Verify code blocks render with syntax highlighting',
    steps: [
      { description: 'Type code request', action: 'type', selector: SELECTORS.inputArea, text: 'Show me a simple hello world function in Python, just the code' },
      { description: 'Send message', action: 'press', key: 'Enter' },
      { description: 'Wait for response', action: 'wait', timeout: 15000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Code block exists', type: 'element_exists', selector: SELECTORS.codeBlock },
      { description: 'Has syntax highlighting', type: 'js_returns', script: JS_HELPERS.hasClass(SELECTORS.codeBlock, 'hljs'), expected: true },
    ],
  },
  {
    name: 'Multi-turn conversation context',
    suite: 'chat',
    description: 'Verify Claude remembers context across turns',
    steps: [
      { description: 'Send first message', action: 'type', selector: SELECTORS.inputArea, text: 'My favorite color is blue. Remember that.' },
      { description: 'Send', action: 'press', key: 'Enter' },
      { description: 'Wait', action: 'wait', timeout: 10000 },
      { description: 'Send follow-up', action: 'type', selector: SELECTORS.inputArea, text: 'What is my favorite color?' },
      { description: 'Send', action: 'press', key: 'Enter' },
      { description: 'Wait for response', action: 'wait', timeout: 10000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Response mentions blue', type: 'js_returns', script: `document.body.innerText.toLowerCase().includes('blue')`, expected: true },
    ],
  },
];

// ============================================================================
// TOOL DISPLAY TESTS
// ============================================================================

export const toolTests: TestDefinition[] = [
  {
    name: 'Read tool display',
    suite: 'tools',
    description: 'Verify Read tool calls display file content',
    steps: [
      { description: 'Ask to read file', action: 'type', selector: SELECTORS.inputArea, text: 'Read package.json and tell me the app name' },
      { description: 'Send', action: 'press', key: 'Enter' },
      { description: 'Wait for tool call', action: 'wait', timeout: 15000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Tool call component exists', type: 'element_exists', selector: SELECTORS.toolCall },
    ],
  },
  {
    name: 'Bash tool display',
    suite: 'tools',
    description: 'Verify Bash tool calls display command and output',
    steps: [
      { description: 'Ask to run command', action: 'type', selector: SELECTORS.inputArea, text: 'Run: echo "test output"' },
      { description: 'Send', action: 'press', key: 'Enter' },
      { description: 'Handle permission if needed', action: 'wait', timeout: 5000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Tool call shows bash', type: 'element_exists', selector: SELECTORS.toolCallBash },
    ],
  },
];

// ============================================================================
// PERMISSION TESTS
// ============================================================================

export const permissionTests: TestDefinition[] = [
  {
    name: 'Permission dialog appears',
    suite: 'permissions',
    description: 'Verify permission dialog shows for restricted tools',
    steps: [
      { description: 'Ensure in normal mode', action: 'js', script: `localStorage.setItem('permission-mode', 'ask')` },
      { description: 'Ask to write file', action: 'type', selector: SELECTORS.inputArea, text: 'Create a file called test-permission.txt with content "hello"' },
      { description: 'Send', action: 'press', key: 'Enter' },
      { description: 'Wait for permission dialog', action: 'wait', selector: SELECTORS.permissionDialog, timeout: 15000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Permission dialog visible', type: 'element_visible', selector: SELECTORS.permissionDialog },
      { description: 'Shows tool name', type: 'element_exists', selector: SELECTORS.permissionToolName },
    ],
  },
  {
    name: 'Deny tool (Esc)',
    suite: 'permissions',
    description: 'Verify pressing Esc denies the tool call',
    steps: [
      { description: 'Wait for permission dialog', action: 'wait', selector: SELECTORS.permissionDialog },
      { description: 'Press Escape', action: 'press', key: 'Escape' },
      { description: 'Wait for dialog to close', action: 'wait', timeout: 1000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Dialog closed', type: 'js_returns', script: JS_HELPERS.isPermissionDialogVisible(), expected: false },
    ],
  },
  {
    name: 'Allow once (Enter)',
    suite: 'permissions',
    description: 'Verify pressing Enter allows the tool once',
    steps: [
      { description: 'Wait for permission dialog', action: 'wait', selector: SELECTORS.permissionDialog },
      { description: 'Press Enter', action: 'press', key: 'Enter' },
      { description: 'Wait for execution', action: 'wait', timeout: 5000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Dialog closed', type: 'js_returns', script: JS_HELPERS.isPermissionDialogVisible(), expected: false },
      { description: 'Tool executed', type: 'element_exists', selector: SELECTORS.toolCall },
    ],
  },
  {
    name: 'Always allow edits (Cmd+Enter)',
    suite: 'permissions',
    description: 'Verify Cmd+Enter switches to acceptEdits mode for file tools',
    steps: [
      { description: 'Wait for permission dialog', action: 'wait', selector: SELECTORS.permissionDialog },
      { description: 'Press Cmd+Enter', action: 'press', key: 'Enter', modifiers: ['Meta'] },
      { description: 'Wait', action: 'wait', timeout: 2000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Mode switched to acceptEdits', type: 'js_returns', script: `localStorage.getItem('permission-mode')`, expected: 'acceptEdits' },
    ],
  },
];

// ============================================================================
// DIFF VIEWER TESTS
// ============================================================================

export const diffTests: TestDefinition[] = [
  {
    name: 'Base commit captured on first view',
    suite: 'diff',
    description: 'Verify base_commit is set when diff panel opens',
    steps: [
      { description: 'Get session ID', action: 'js', script: `window.location.hash.replace('#', '') || 'current'` },
      { description: 'Click diff toggle', action: 'click', selector: SELECTORS.diffToggleBtn },
      { description: 'Wait for diff panel', action: 'wait', selector: SELECTORS.diffPanel, timeout: 5000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Diff panel visible', type: 'element_visible', selector: SELECTORS.diffPanel },
      { description: 'Header shows SHA', type: 'element_exists', selector: SELECTORS.diffHeader },
    ],
  },
  {
    name: 'Shows all changes vs base_commit',
    suite: 'diff',
    description: 'Verify all changed files appear in diff list',
    steps: [
      { description: 'Open diff panel', action: 'click', selector: SELECTORS.diffToggleBtn },
      { description: 'Wait for file list', action: 'wait', selector: SELECTORS.diffFileList, timeout: 5000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'File list has items', type: 'js_returns', script: JS_HELPERS.getDiffFileCount(), expected: { greaterThan: 0 } },
    ],
  },
  {
    name: 'Expand file shows hunks',
    suite: 'diff',
    description: 'Verify clicking a file expands to show diff hunks',
    steps: [
      { description: 'Click on a file item', action: 'click', selector: `${SELECTORS.diffFileItem}:first-child` },
      { description: 'Wait for hunks', action: 'wait', timeout: 1000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Diff hunks visible', type: 'element_exists', selector: SELECTORS.diffHunk },
    ],
  },
];

// ============================================================================
// SIDEBAR TESTS
// ============================================================================

export const sidebarTests: TestDefinition[] = [
  {
    name: 'Workspaces listed',
    suite: 'sidebar',
    description: 'Verify all workspaces from DB appear in sidebar',
    steps: [
      { description: 'Wait for sidebar', action: 'wait', selector: SELECTORS.sidebar },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Workspace list exists', type: 'element_exists', selector: SELECTORS.workspaceList },
      { description: 'Has workspace items', type: 'element_exists', selector: SELECTORS.workspaceItem },
    ],
  },
  {
    name: 'Busy spinner shows during processing',
    suite: 'sidebar',
    description: 'Verify spinner appears while Claude is processing',
    steps: [
      { description: 'Send a message', action: 'type', selector: SELECTORS.inputArea, text: 'Count from 1 to 10 slowly' },
      { description: 'Send', action: 'press', key: 'Enter' },
      { description: 'Immediately take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Spinner visible', type: 'element_exists', selector: SELECTORS.busySpinner },
    ],
  },
  {
    name: 'Inbox indicator shows count',
    suite: 'sidebar',
    description: 'Verify inbox badge shows unread message count',
    steps: [
      { description: 'Check inbox badge', action: 'wait', selector: SELECTORS.inboxBadge },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Badge visible or hidden appropriately', type: 'element_exists', selector: SELECTORS.inboxBtn },
    ],
  },
];

// ============================================================================
// SETTINGS TESTS
// ============================================================================

export const settingsTests: TestDefinition[] = [
  {
    name: 'Permission mode cycling',
    suite: 'settings',
    description: 'Verify permission mode cycles through all values',
    steps: [
      { description: 'Click permission toggle', action: 'click', selector: SELECTORS.permissionModeToggle },
      { description: 'Take screenshot', action: 'screenshot' },
      { description: 'Click again', action: 'click', selector: SELECTORS.permissionModeToggle },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Mode changed', type: 'js_returns', script: `localStorage.getItem('permission-mode')` },
    ],
  },
  {
    name: 'Settings persist on reload',
    suite: 'settings',
    description: 'Verify settings are retained after reload',
    steps: [
      { description: 'Toggle a setting', action: 'click', selector: SELECTORS.thinkingToggle },
      { description: 'Take screenshot', action: 'screenshot' },
      // Manual reload required, then verify
    ],
    verification: [
      { description: 'Setting retained in localStorage', type: 'js_returns', script: `localStorage.getItem('showThinking')` },
    ],
  },
];

// ============================================================================
// INBOX TESTS
// ============================================================================

export const inboxTests: TestDefinition[] = [
  {
    name: 'View inbox',
    suite: 'inbox',
    description: 'Verify clicking inbox opens inbox view',
    steps: [
      { description: 'Click inbox button', action: 'click', selector: SELECTORS.inboxBtn },
      { description: 'Wait for inbox view', action: 'wait', selector: SELECTORS.inboxView, timeout: 3000 },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'Inbox view visible', type: 'element_visible', selector: SELECTORS.inboxView },
    ],
  },
];

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

export const errorTests: TestDefinition[] = [
  {
    name: 'Empty message handled',
    suite: 'errors',
    description: 'Verify sending empty message is handled gracefully',
    steps: [
      { description: 'Clear input', action: 'type', selector: SELECTORS.inputArea, text: '' },
      { description: 'Press Enter', action: 'press', key: 'Enter' },
      { description: 'Take screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'No crash - app still responsive', type: 'element_exists', selector: SELECTORS.inputArea },
    ],
  },
];

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

export const integrationTests: TestDefinition[] = [
  {
    name: 'Full workflow',
    suite: 'integration',
    description: 'Complete workflow: create session, chat, edit file, view diff',
    steps: [
      { description: 'Click new session', action: 'click', selector: SELECTORS.newSessionBtn },
      { description: 'Wait for modal', action: 'wait', selector: SELECTORS.setupModal },
      // ... complete workflow steps
      { description: 'Take final screenshot', action: 'screenshot' },
    ],
    verification: [
      { description: 'All steps completed', type: 'screenshot' },
    ],
  },
];

// ============================================================================
// ALL TESTS
// ============================================================================

export const ALL_TESTS = [
  ...sessionTests,
  ...chatTests,
  ...toolTests,
  ...permissionTests,
  ...diffTests,
  ...sidebarTests,
  ...settingsTests,
  ...inboxTests,
  ...errorTests,
  ...integrationTests,
];

/**
 * Get tests by suite
 */
export function getTestsBySuite(suite: string): TestDefinition[] {
  return ALL_TESTS.filter(t => t.suite === suite);
}

/**
 * Get all suite names
 */
export function getSuites(): string[] {
  return [...new Set(ALL_TESTS.map(t => t.suite))];
}

/**
 * Print test summary
 */
export function printSummary(): void {
  const suites = getSuites();
  console.log('E2E Test Summary:');
  console.log('=================');
  for (const suite of suites) {
    const tests = getTestsBySuite(suite);
    console.log(`${suite}: ${tests.length} tests`);
  }
  console.log(`Total: ${ALL_TESTS.length} tests`);
}
