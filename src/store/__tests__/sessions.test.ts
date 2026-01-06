import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore, Session, SessionPhase } from '../sessions';

// Mock the API module
vi.mock('../api', () => ({
  createSession: vi.fn(() =>
    Promise.resolve({
      id: 'test-session-id',
      name: 'Test Session',
      cwd: '/test/path',
      status: 'ready',
    })
  ),
  deleteSession: vi.fn(() => Promise.resolve()),
  renameSession: vi.fn(() => Promise.resolve()),
  getSessions: vi.fn(() => Promise.resolve([])),
  getSessionStatus: vi.fn(() => Promise.resolve('ready')),
}));

describe('SessionStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
    });
  });

  describe('addSession', () => {
    it('should add a new session and set it as active', async () => {
      const id = await useSessionStore.getState().addSession('Test', '/test/path');

      expect(id).toBe('test-session-id');
      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().activeSessionId).toBe('test-session-id');

      const session = useSessionStore.getState().sessions[0];
      expect(session.name).toBe('Test Session');
      expect(session.phase.type).toBe('running_claude');
    });
  });

  describe('removeSession', () => {
    it('should remove session and update active session', () => {
      // Set up initial state with multiple sessions
      const sessions: Session[] = [
        {
          id: 'session-1',
          name: 'Session 1',
          cwd: '/path/1',
          unreadCount: 0,
          phase: { type: 'idle' },
        },
        {
          id: 'session-2',
          name: 'Session 2',
          cwd: '/path/2',
          unreadCount: 0,
          phase: { type: 'idle' },
        },
      ];
      useSessionStore.setState({ sessions, activeSessionId: 'session-1' });

      // Remove the active session
      useSessionStore.getState().removeSession('session-1');

      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().sessions[0].id).toBe('session-2');
      expect(useSessionStore.getState().activeSessionId).toBe('session-2');
    });

    it('should set activeSessionId to null when last session removed', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'only-session',
            name: 'Only',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'only-session',
      });

      useSessionStore.getState().removeSession('only-session');

      expect(useSessionStore.getState().sessions).toHaveLength(0);
      expect(useSessionStore.getState().activeSessionId).toBeNull();
    });
  });

  describe('setActiveSession', () => {
    it('should set the active session and mark as started', () => {
      const sessions: Session[] = [
        {
          id: 'session-1',
          name: 'Session 1',
          cwd: '/path',
          unreadCount: 0,
          started: false,
          phase: { type: 'idle' },
        },
      ];
      useSessionStore.setState({ sessions, activeSessionId: null });

      useSessionStore.getState().setActiveSession('session-1');

      expect(useSessionStore.getState().activeSessionId).toBe('session-1');
      expect(useSessionStore.getState().sessions[0].started).toBe(true);
    });
  });

  describe('renameSession', () => {
    it('should rename the session', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Old Name',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().renameSession('session-1', 'New Name');

      expect(useSessionStore.getState().sessions[0].name).toBe('New Name');
    });
  });

  describe('setPhase', () => {
    it('should update session phase', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'session-1',
      });

      const newPhase: SessionPhase = { type: 'running_claude' };
      useSessionStore.getState().setPhase('session-1', newPhase);

      expect(useSessionStore.getState().sessions[0].phase.type).toBe('running_claude');
    });

    it('should set finalCwd when phase is ready', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/initial',
            unreadCount: 0,
            phase: { type: 'running_script', output: [] },
          },
        ],
        activeSessionId: 'session-1',
      });

      const readyPhase: SessionPhase = { type: 'ready', finalCwd: '/final/path' };
      useSessionStore.getState().setPhase('session-1', readyPhase);

      expect(useSessionStore.getState().sessions[0].finalCwd).toBe('/final/path');
    });
  });

  describe('unread count', () => {
    it('should increment unread count up to 10', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: null,
      });

      // Increment 15 times
      for (let i = 0; i < 15; i++) {
        useSessionStore.getState().incrementUnread('session-1');
      }

      // Should cap at 10
      expect(useSessionStore.getState().sessions[0].unreadCount).toBe(10);
    });

    it('should clear unread count', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 5,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().clearUnread('session-1');

      expect(useSessionStore.getState().sessions[0].unreadCount).toBe(0);
    });
  });

  describe('awaitingInput', () => {
    it('should set awaitingInput flag', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'running_claude' },
            awaitingInput: false,
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().setAwaitingInput('session-1', true);
      expect(useSessionStore.getState().sessions[0].awaitingInput).toBe(true);

      useSessionStore.getState().setAwaitingInput('session-1', false);
      expect(useSessionStore.getState().sessions[0].awaitingInput).toBe(false);
    });
  });

  describe('baseCommit', () => {
    it('should set baseCommit', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().setBaseCommit('session-1', 'abc123');

      expect(useSessionStore.getState().sessions[0].baseCommit).toBe('abc123');
    });
  });

  describe('activateSession / idleSession', () => {
    it('should transition from idle to running_claude', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().activateSession('session-1');

      const session = useSessionStore.getState().sessions[0];
      expect(session.phase.type).toBe('running_claude');
      expect(session.awaitingInput).toBe(true);
      expect(session.lastActivityAt).toBeDefined();
    });

    it('should not activate if not idle', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'running_claude' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().activateSession('session-1');

      // Should remain running_claude
      expect(useSessionStore.getState().sessions[0].phase.type).toBe('running_claude');
    });

    it('should transition from running_claude to idle', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'running_claude' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().idleSession('session-1');

      expect(useSessionStore.getState().sessions[0].phase.type).toBe('idle');
    });
  });

  describe('setClaudeBusy', () => {
    it('should set isClaudeBusy flag', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'running_claude' },
            isClaudeBusy: false,
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().setClaudeBusy('session-1', true);
      expect(useSessionStore.getState().sessions[0].isClaudeBusy).toBe(true);

      useSessionStore.getState().setClaudeBusy('session-1', false);
      expect(useSessionStore.getState().sessions[0].isClaudeBusy).toBe(false);
    });
  });

  describe('appendScriptOutput', () => {
    it('should append output to running_script phase', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'running_script', output: ['line1'] },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().appendScriptOutput('session-1', 'line2');

      const phase = useSessionStore.getState().sessions[0].phase;
      expect(phase.type).toBe('running_script');
      if (phase.type === 'running_script') {
        expect(phase.output).toEqual(['line1', 'line2']);
      }
    });

    it('should not append output if not in running_script phase', () => {
      useSessionStore.setState({
        sessions: [
          {
            id: 'session-1',
            name: 'Test',
            cwd: '/path',
            unreadCount: 0,
            phase: { type: 'idle' },
          },
        ],
        activeSessionId: 'session-1',
      });

      useSessionStore.getState().appendScriptOutput('session-1', 'line');

      // Phase should remain idle
      expect(useSessionStore.getState().sessions[0].phase.type).toBe('idle');
    });
  });
});
