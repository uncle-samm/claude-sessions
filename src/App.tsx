import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { HeadlessChat } from "./components/HeadlessChat";
import { SetupModal } from "./components/SetupModal";
import { DiffViewer } from "./components/DiffViewer";
import { useSessionStore, Session } from "./store/sessions";
import "./App.css";

function SessionContainer({ session, isActive }: { session: Session; isActive: boolean }) {
  const phaseType = session.phase.type;

  // Show SetupModal for script phases
  if (phaseType === "running_script" || phaseType === "script_error") {
    return (
      <SetupModal
        session={session}
        isActive={isActive}
      />
    );
  }

  // Show HeadlessChat for claude phase
  if (phaseType === "running_claude") {
    return (
      <HeadlessChat
        sessionId={session.id}
        cwd={session.finalCwd || session.cwd}
        isActive={isActive}
      />
    );
  }

  // Show idle placeholder for idle sessions (only when active)
  if (phaseType === "idle" && isActive) {
    return (
      <div className="idle-session-placeholder">
        <span className="idle-icon" aria-hidden="true" />
        <p className="idle-title">Session is idle</p>
        <p className="idle-subtitle">Activating... (terminal will start shortly)</p>
      </div>
    );
  }

  // Pending or ready state - show nothing
  return null;
}

function App() {
  const { sessions, activeSessionId, loadFromStorage, pollSessionStatus, startAutoIdleTimer, activateSession } = useSessionStore();
  const [showDiffPanel, setShowDiffPanel] = useState(false);

  useEffect(() => {
    loadFromStorage();
    pollSessionStatus(); // Start polling for MCP status updates
    startAutoIdleTimer(); // Start auto-idle timer (5min inactivity -> idle)
  }, [loadFromStorage, pollSessionStatus, startAutoIdleTimer]);

  // Auto-activate the active session if it's idle (after initial load)
  const activeSessionForEffect = sessions.find(s => s.id === activeSessionId);
  useEffect(() => {
    if (!activeSessionId || !activeSessionForEffect) return;
    if (activeSessionForEffect.phase.type === "idle") {
      activateSession(activeSessionId);
    }
  }, [activeSessionId, activeSessionForEffect?.phase.type, activateSession]);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const canShowDiff = activeSession && activeSession.phase.type === "running_claude";

  return (
    <main className="app-layout">
      <Sidebar />
      <div className={`main-content ${showDiffPanel ? "with-diff-panel" : ""}`}>
        {/* Terminal Area - always visible */}
        <div className="terminal-area">
          {/* Diff Toggle Button */}
          {canShowDiff && (
            <button
              className={`diff-toggle-btn ${showDiffPanel ? "active" : ""}`}
              onClick={() => setShowDiffPanel(!showDiffPanel)}
              title={showDiffPanel ? "Hide diff panel" : "Show diff panel"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M12 3v18M3 12h18" />
              </svg>
              {showDiffPanel ? "Hide Diff" : "Show Diff"}
            </button>
          )}

          {/* Terminal Content */}
          {sessions.map((session) => (
            <SessionContainer
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
            />
          ))}
          {sessions.length === 0 && (
            <div className="empty-state">
              <p>No sessions yet</p>
              <p>Click + on a workspace to start a session</p>
            </div>
          )}
        </div>

        {/* Diff Panel - side by side with terminal */}
        {showDiffPanel && canShowDiff && (
          <div className="diff-panel">
            <DiffViewer onClose={() => setShowDiffPanel(false)} />
          </div>
        )}
      </div>
    </main>
  );
}

export default App;
