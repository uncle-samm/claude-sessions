import { useEffect, useState } from "react";
import { useInboxStore, InboxMessage } from "../store/inbox";
import { useSessionStore } from "../store/sessions";
import { useViewModeStore } from "../store/viewMode";

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function parseMessage(message: string): { isReviewRequest: boolean; content: string } {
  if (message.startsWith("[Review Request] ")) {
    return {
      isReviewRequest: true,
      content: message.slice("[Review Request] ".length),
    };
  }
  return { isReviewRequest: false, content: message };
}

export function Inbox() {
  const {
    messages,
    isExpanded,
    toggleExpanded,
    markRead,
    markUnread,
    deleteMessage,
    clearAll,
    startPolling,
    stopPolling,
  } = useInboxStore();
  const { setActiveSession, sessions } = useSessionStore();
  const { setViewMode } = useViewModeStore();
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const unreadCount = messages.filter((m) => !m.readAt).length;

  const handleMessageClick = (message: InboxMessage) => {
    // Check if session exists and navigate to it
    const sessionExists = sessions.some((s) => s.id === message.sessionId);

    if (sessionExists) {
      // Navigate to the session
      setActiveSession(message.sessionId);
      // Mark as read
      if (!message.readAt) {
        markRead(message.id);
      }
    } else {
      // Session doesn't exist, just expand/collapse the message
      if (expandedMessageId === message.id) {
        setExpandedMessageId(null);
      } else {
        setExpandedMessageId(message.id);
        if (!message.readAt) {
          markRead(message.id);
        }
      }
    }
  };

  const handleExpandClick = (e: React.MouseEvent, messageId: string) => {
    e.stopPropagation();
    if (expandedMessageId === messageId) {
      setExpandedMessageId(null);
    } else {
      setExpandedMessageId(messageId);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteMessage(id);
  };

  const handleMarkUnread = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    markUnread(id);
  };

  return (
    <div className="inbox-section">
      <div className="inbox-header" onClick={toggleExpanded}>
        <span className={`chevron ${isExpanded ? "expanded" : ""}`}>›</span>
        <span className="inbox-title">Inbox</span>
        {unreadCount > 0 && (
          <span className="inbox-unread-badge">{unreadCount}</span>
        )}
        {messages.length > 0 && (
          <button
            className="inbox-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            title="Clear all messages"
          >
            Clear
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="inbox-messages">
          {messages.length === 0 ? (
            <div className="inbox-empty">No messages yet</div>
          ) : (
            messages.map((message) => {
              const isMessageExpanded = expandedMessageId === message.id;
              const sessionExists = sessions.some((s) => s.id === message.sessionId);
              const { isReviewRequest, content } = parseMessage(message.message);

              return (
                <div
                  key={message.id}
                  className={`inbox-message ${!message.readAt ? "unread" : ""} ${isMessageExpanded ? "expanded" : ""} ${sessionExists ? "has-session" : "no-session"} ${isReviewRequest ? "review-request" : ""}`}
                  onClick={() => handleMessageClick(message)}
                  title={sessionExists ? "Click to go to session" : "Session no longer exists"}
                >
                  <div className="inbox-message-header">
                    {isReviewRequest && (
                      <span className="inbox-review-badge" title="Review Requested">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                      </span>
                    )}
                    <span className="inbox-session-name">
                      {message.sessionName}
                    </span>
                    <span className="inbox-message-time">
                      {formatRelativeTime(message.createdAt)}
                    </span>
                    {content.length > 80 && (
                      <button
                        className="inbox-expand-btn"
                        onClick={(e) => handleExpandClick(e, message.id)}
                        title={isMessageExpanded ? "Collapse" : "Expand"}
                      >
                        {isMessageExpanded ? "−" : "+"}
                      </button>
                    )}
                    {message.readAt && (
                      <button
                        className="inbox-unread-btn"
                        onClick={(e) => handleMarkUnread(e, message.id)}
                        title="Mark as unread"
                      >
                        ●
                      </button>
                    )}
                    <button
                      className="inbox-delete-btn"
                      onClick={(e) => handleDelete(e, message.id)}
                      title="Delete message"
                    >
                      ×
                    </button>
                  </div>
                  <div className="inbox-message-content">
                    {isMessageExpanded ? content : content.slice(0, 80) + (content.length > 80 ? "..." : "")}
                  </div>
                  {isReviewRequest && sessionExists && (
                    <div className="inbox-review-actions">
                      <button
                        className="review-action-btn view-diff"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSession(message.sessionId);
                          setViewMode("diff");
                        }}
                      >
                        View Changes
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
