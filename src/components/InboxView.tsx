import { useState } from "react";
import { useInboxStore, InboxMessage } from "../store/inbox";
import { useSessionStore } from "../store/sessions";

interface InboxViewProps {
  onClose: () => void;
}

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

export function InboxView({ onClose }: InboxViewProps) {
  const {
    messages,
    markRead,
    markUnread,
    deleteMessage,
    clearAll,
  } = useInboxStore();
  const { setActiveSession, sessions } = useSessionStore();
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  const unreadCount = messages.filter((m) => !m.readAt).length;

  const handleMessageClick = (message: InboxMessage) => {
    const sessionExists = sessions.some((s) => s.id === message.sessionId);

    if (sessionExists) {
      setActiveSession(message.sessionId);
      if (!message.readAt) {
        markRead(message.id);
      }
      onClose();
    } else {
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
    <div className="inbox-view">
      <div className="inbox-view-header">
        <h3>Inbox</h3>
        {unreadCount > 0 && (
          <span className="inbox-view-count">{unreadCount} unread</span>
        )}
        {messages.length > 0 && (
          <button className="inbox-view-clear" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      <div className="inbox-view-messages">
        {messages.length === 0 ? (
          <div className="inbox-view-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <polyline points="3,7 12,13 21,7" />
            </svg>
            <p>No messages yet</p>
            <span>Messages from your Claude sessions will appear here</span>
          </div>
        ) : (
          messages.map((message) => {
            const isMessageExpanded = expandedMessageId === message.id;
            const sessionExists = sessions.some((s) => s.id === message.sessionId);

            return (
              <div
                key={message.id}
                className={`inbox-view-message ${!message.readAt ? "unread" : ""} ${isMessageExpanded ? "expanded" : ""} ${sessionExists ? "has-session" : "no-session"}`}
                onClick={() => handleMessageClick(message)}
              >
                <div className="inbox-view-message-header">
                  <div className="inbox-view-message-info">
                    {!message.readAt && <span className="unread-dot"></span>}
                    <span className="inbox-view-session-name">
                      {message.sessionName}
                    </span>
                    <span className="inbox-view-message-time">
                      {formatRelativeTime(message.createdAt)}
                    </span>
                  </div>
                  <div className="inbox-view-message-actions">
                    {message.message.length > 100 && (
                      <button
                        className="inbox-view-expand-btn"
                        onClick={(e) => handleExpandClick(e, message.id)}
                        title={isMessageExpanded ? "Collapse" : "Expand"}
                      >
                        {isMessageExpanded ? "−" : "+"}
                      </button>
                    )}
                    {message.readAt && (
                      <button
                        className="inbox-view-unread-btn"
                        onClick={(e) => handleMarkUnread(e, message.id)}
                        title="Mark as unread"
                      >
                        ●
                      </button>
                    )}
                    <button
                      className="inbox-view-delete-btn"
                      onClick={(e) => handleDelete(e, message.id)}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="inbox-view-message-content">
                  {isMessageExpanded
                    ? message.message
                    : message.message.slice(0, 100) + (message.message.length > 100 ? "..." : "")}
                </div>
                {sessionExists && (
                  <div className="inbox-view-message-footer">
                    <span className="go-to-session">Go to session →</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
