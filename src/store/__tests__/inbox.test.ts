import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useInboxStore, isManuallyUnread, isNaturallyUnread, InboxMessage } from '../inbox';

// Mock the API module
vi.mock('../api', () => ({
  getInboxMessages: vi.fn(() => Promise.resolve([])),
  markInboxMessageRead: vi.fn(() => Promise.resolve()),
  markInboxMessageUnread: vi.fn(() => Promise.resolve()),
  markSessionMessagesRead: vi.fn(() => Promise.resolve()),
  deleteInboxMessage: vi.fn(() => Promise.resolve()),
  clearInbox: vi.fn(() => Promise.resolve()),
}));

describe('InboxStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useInboxStore.setState({
      messages: [],
      isExpanded: true,
      isLoading: false,
    });
  });

  describe('helper functions', () => {
    it('isManuallyUnread returns true when readAt is null but firstReadAt is set', () => {
      const message: InboxMessage = {
        id: '1',
        sessionId: 'session-1',
        sessionName: 'Test Session',
        message: 'Hello',
        createdAt: new Date(),
        readAt: null,
        firstReadAt: new Date(),
      };
      expect(isManuallyUnread(message)).toBe(true);
      expect(isNaturallyUnread(message)).toBe(false);
    });

    it('isNaturallyUnread returns true when both readAt and firstReadAt are null', () => {
      const message: InboxMessage = {
        id: '1',
        sessionId: 'session-1',
        sessionName: 'Test Session',
        message: 'Hello',
        createdAt: new Date(),
        readAt: null,
        firstReadAt: null,
      };
      expect(isNaturallyUnread(message)).toBe(true);
      expect(isManuallyUnread(message)).toBe(false);
    });

    it('both return false when message is read', () => {
      const message: InboxMessage = {
        id: '1',
        sessionId: 'session-1',
        sessionName: 'Test Session',
        message: 'Hello',
        createdAt: new Date(),
        readAt: new Date(),
        firstReadAt: new Date(),
      };
      expect(isManuallyUnread(message)).toBe(false);
      expect(isNaturallyUnread(message)).toBe(false);
    });
  });

  describe('toggleExpanded', () => {
    it('should toggle isExpanded state', () => {
      expect(useInboxStore.getState().isExpanded).toBe(true);

      useInboxStore.getState().toggleExpanded();
      expect(useInboxStore.getState().isExpanded).toBe(false);

      useInboxStore.getState().toggleExpanded();
      expect(useInboxStore.getState().isExpanded).toBe(true);
    });
  });

  describe('getUnreadCountForSession', () => {
    it('should return correct counts for natural and manual unread', () => {
      const sessionId = 'test-session';
      useInboxStore.setState({
        messages: [
          // Natural unread (never read)
          {
            id: '1',
            sessionId,
            sessionName: 'Test',
            message: 'msg1',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
          // Natural unread (never read)
          {
            id: '2',
            sessionId,
            sessionName: 'Test',
            message: 'msg2',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
          // Manual unread (was read, now unread)
          {
            id: '3',
            sessionId,
            sessionName: 'Test',
            message: 'msg3',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: new Date(),
          },
          // Read message
          {
            id: '4',
            sessionId,
            sessionName: 'Test',
            message: 'msg4',
            createdAt: new Date(),
            readAt: new Date(),
            firstReadAt: new Date(),
          },
          // Different session
          {
            id: '5',
            sessionId: 'other-session',
            sessionName: 'Other',
            message: 'msg5',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
        ],
      });

      const counts = useInboxStore.getState().getUnreadCountForSession(sessionId);
      expect(counts.natural).toBe(2);
      expect(counts.manual).toBe(1);
    });

    it('should return zero counts for session with no messages', () => {
      const counts = useInboxStore.getState().getUnreadCountForSession('nonexistent');
      expect(counts.natural).toBe(0);
      expect(counts.manual).toBe(0);
    });
  });

  describe('markRead', () => {
    it('should mark message as read and set firstReadAt if not set', async () => {
      const message: InboxMessage = {
        id: 'test-id',
        sessionId: 'session-1',
        sessionName: 'Test',
        message: 'Hello',
        createdAt: new Date(),
        readAt: null,
        firstReadAt: null,
      };
      useInboxStore.setState({ messages: [message] });

      await useInboxStore.getState().markRead('test-id');

      const updated = useInboxStore.getState().messages[0];
      expect(updated.readAt).not.toBeNull();
      expect(updated.firstReadAt).not.toBeNull();
    });

    it('should preserve firstReadAt when marking read again', async () => {
      const originalFirstRead = new Date('2024-01-01');
      const message: InboxMessage = {
        id: 'test-id',
        sessionId: 'session-1',
        sessionName: 'Test',
        message: 'Hello',
        createdAt: new Date(),
        readAt: null,
        firstReadAt: originalFirstRead,
      };
      useInboxStore.setState({ messages: [message] });

      await useInboxStore.getState().markRead('test-id');

      const updated = useInboxStore.getState().messages[0];
      expect(updated.firstReadAt).toEqual(originalFirstRead);
    });
  });

  describe('markUnread', () => {
    it('should set readAt to null while preserving firstReadAt', async () => {
      const firstReadAt = new Date('2024-01-01');
      const message: InboxMessage = {
        id: 'test-id',
        sessionId: 'session-1',
        sessionName: 'Test',
        message: 'Hello',
        createdAt: new Date(),
        readAt: new Date(),
        firstReadAt,
      };
      useInboxStore.setState({ messages: [message] });

      await useInboxStore.getState().markUnread('test-id');

      const updated = useInboxStore.getState().messages[0];
      expect(updated.readAt).toBeNull();
      expect(updated.firstReadAt).toEqual(firstReadAt);
    });
  });

  describe('deleteMessage', () => {
    it('should remove message from store', async () => {
      useInboxStore.setState({
        messages: [
          {
            id: 'keep',
            sessionId: 's1',
            sessionName: 'Test',
            message: 'keep',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
          {
            id: 'delete',
            sessionId: 's2',
            sessionName: 'Test',
            message: 'delete',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
        ],
      });

      await useInboxStore.getState().deleteMessage('delete');

      expect(useInboxStore.getState().messages).toHaveLength(1);
      expect(useInboxStore.getState().messages[0].id).toBe('keep');
    });
  });

  describe('clearAll', () => {
    it('should remove all messages', async () => {
      useInboxStore.setState({
        messages: [
          {
            id: '1',
            sessionId: 's1',
            sessionName: 'Test',
            message: 'msg1',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
          {
            id: '2',
            sessionId: 's2',
            sessionName: 'Test',
            message: 'msg2',
            createdAt: new Date(),
            readAt: null,
            firstReadAt: null,
          },
        ],
      });

      await useInboxStore.getState().clearAll();

      expect(useInboxStore.getState().messages).toHaveLength(0);
    });
  });
});
