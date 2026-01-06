import { useEffect, useRef, useState } from "react";
import { useSessionStore, Session } from "../store/sessions";
import { useWorkspaceStore, Workspace } from "../store/workspaces";
import { useSettingsStore } from "../store/settings";
import { useInboxStore } from "../store/inbox";
import { AddWorkspaceModal } from "./AddWorkspaceModal";
import { InboxView } from "./InboxView";
import { SettingsModal } from "./SettingsModal";

export function Sidebar() {
  const { sessions, activeSessionId, addWorkspaceSession, removeSession, setActiveSession, renameSession, activateSession } =
    useSessionStore();
  const { workspaces, expandedWorkspaces, loadWorkspaces, toggleExpanded } = useWorkspaceStore();
  const { debugPauseAfterSetup } = useSettingsStore();
  const { messages, startPolling, stopPolling, getUnreadCountForSession, markSessionRead } = useInboxStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [newSessionWorkspaceId, setNewSessionWorkspaceId] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const [showInboxView, setShowInboxView] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newSessionInputRef = useRef<HTMLInputElement>(null);

  const unreadCount = messages.filter((m) => !m.readAt).length;

  useEffect(() => {
    loadWorkspaces();
    startPolling();
    return () => stopPolling();
  }, [loadWorkspaces, startPolling, stopPolling]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (newSessionWorkspaceId && newSessionInputRef.current) {
      newSessionInputRef.current.focus();
    }
  }, [newSessionWorkspaceId]);

  const handleStartNewSession = (workspace: Workspace) => {
    setNewSessionWorkspaceId(workspace.id);
    setNewSessionName("");
  };

  const handleNewSessionSubmit = (workspace: Workspace) => {
    const name = newSessionName.trim();
    if (name) {
      addWorkspaceSession(workspace.id, workspace.folder, workspace.scriptPath, name);
    }
    setNewSessionWorkspaceId(null);
    setNewSessionName("");
  };

  const handleNewSessionKeyDown = (e: React.KeyboardEvent, workspace: Workspace) => {
    if (e.key === "Enter") {
      handleNewSessionSubmit(workspace);
    } else if (e.key === "Escape") {
      setNewSessionWorkspaceId(null);
      setNewSessionName("");
    }
  };

  const handleRemoveSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeSession(id);
  };

  const handleDoubleClick = (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditName(session.name);
  };

  const handleRenameSubmit = () => {
    if (editingId && editName.trim()) {
      renameSession(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditName("");
    }
  };

  const getSessionsForWorkspace = (workspaceId: string) => {
    return sessions.filter((s) => s.workspaceId === workspaceId);
  };

  return (
    <aside className="sidebar" data-testid="sidebar">
      {/* App Title */}
      <div className="sidebar-title">
        <span className="title-text">Agent Manager</span>
        <span className="title-badge">Preview</span>
      </div>

      {/* Inbox Row */}
      <div
        className={`sidebar-inbox-row ${showInboxView ? 'active' : ''}`}
        onClick={() => setShowInboxView(!showInboxView)}
        data-testid="inbox-btn"
      >
        <div className="inbox-icon-wrapper">
          <svg className="inbox-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <polyline points="3,7 12,13 21,7" />
          </svg>
          {unreadCount > 0 && (
            <span className="inbox-badge" data-testid="inbox-badge">{unreadCount}</span>
          )}
        </div>
        <span className="inbox-label">Inbox</span>
      </div>

      {/* Inbox View Panel */}
      {showInboxView && (
        <InboxView onClose={() => setShowInboxView(false)} />
      )}

      {/* Workspaces Section */}
      {!showInboxView && (
        <>
          <div className="sidebar-section-header">
            <span>Workspaces</span>
          </div>

          <div className="workspace-list" data-testid="workspace-list">
            {workspaces.map((workspace) => {
              const isExpanded = expandedWorkspaces.has(workspace.id);
              const workspaceSessions = getSessionsForWorkspace(workspace.id);

              return (
                <div key={workspace.id} className="workspace-section" data-testid="workspace-item">
                  <div className="workspace-header" onClick={() => toggleExpanded(workspace.id)}>
                    <span className={`chevron ${isExpanded ? "expanded" : ""}`}>›</span>
                    <span className="workspace-name">{workspace.name}</span>
                    <button
                      className="add-session-btn"
                      data-testid="add-session-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartNewSession(workspace);
                      }}
                      title="New session"
                    >
                      +
                    </button>
                  </div>

                  {isExpanded && (
                    <ul className="session-list">
                      {newSessionWorkspaceId === workspace.id && (
                        <li className="session-item new-session-input-item">
                          <input
                            ref={newSessionInputRef}
                            type="text"
                            className="session-name-input new-session-input"
                            data-testid="new-session-input"
                            placeholder="worktree name"
                            value={newSessionName}
                            onChange={(e) => setNewSessionName(e.target.value)}
                            onBlur={() => {
                              if (!newSessionName.trim()) {
                                setNewSessionWorkspaceId(null);
                              }
                            }}
                            onKeyDown={(e) => handleNewSessionKeyDown(e, workspace)}
                          />
                        </li>
                      )}
                      {workspaceSessions.map((session) => {
                        const isIdle = session.phase.type === "idle";
                        const isSettingUp = session.phase.type === "running_script";
                        const hasError = session.phase.type === "script_error";
                        // Show spinner when Claude is busy (detected from terminal output)
                        const isBusy = session.phase.type === "running_claude" && session.isClaudeBusy === true;

                        return (
                        <li
                          key={session.id}
                          className={`session-item ${session.id === activeSessionId ? "active" : ""} ${isSettingUp ? "setting-up" : ""} ${hasError ? "has-error" : ""} ${isIdle ? "session-idle" : ""}`}
                          data-testid="session-item"
                          onClick={() => {
                            // Activate idle sessions before selecting
                            if (isIdle) {
                              activateSession(session.id);
                            }
                            setActiveSession(session.id);
                            markSessionRead(session.id);
                          }}
                          onDoubleClick={(e) => handleDoubleClick(e, session)}
                        >
                          {isSettingUp && <span className="session-spinner" data-testid="setup-spinner"></span>}
                          {isBusy && <span className="session-busy-spinner" data-testid="busy-spinner"></span>}
                          {hasError && <span className="session-error-icon">!</span>}
                          {editingId === session.id ? (
                            <input
                              ref={inputRef}
                              type="text"
                              className="session-name-input"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onBlur={handleRenameSubmit}
                              onKeyDown={handleRenameKeyDown}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className="session-name" data-testid="session-name">{isSettingUp ? "Setting up..." : isIdle ? `${session.name}` : session.name}</span>
                          )}
                          {(() => {
                            const { natural, manual } = getUnreadCountForSession(session.id);
                            const total = natural + manual;
                            if (total === 0 || session.id === activeSessionId) return null;
                            // Natural unread shows count, manual unread shows dot
                            if (natural > 0) {
                              return (
                                <span className="unread-badge">
                                  {natural > 9 ? "9+" : natural}
                                </span>
                              );
                            }
                            // Only manual unread - show dot (WhatsApp style)
                            return <span className="unread-dot"></span>;
                          })()}
                          <button
                            className="close-btn"
                            onClick={(e) => handleRemoveSession(e, session.id)}
                            title="Close session"
                          >
                            ×
                          </button>
                        </li>
                      );
                      })}
                      {workspaceSessions.length === 0 && newSessionWorkspaceId !== workspace.id && (
                        <li className="empty-workspace-hint">Click + to add a session</li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {workspaces.length === 0 && (
            <p className="empty-hint">
              No workspaces configured.<br />
              Click below to add one.
            </p>
          )}

          {/* Add Workspace Button */}
          <button
            className="open-workspace-btn"
            onClick={() => setShowAddWorkspace(true)}
          >
            <span>Open Workspace</span>
          </button>
        </>
      )}

      {/* Bottom Navigation */}
      <div className="sidebar-bottom-nav">
        <div className="nav-item" onClick={() => setShowSettings(true)} data-testid="settings-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
          {debugPauseAfterSetup && <span className="setting-indicator">•</span>}
        </div>
      </div>

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      <AddWorkspaceModal
        isOpen={showAddWorkspace}
        onClose={() => setShowAddWorkspace(false)}
      />
    </aside>
  );
}
