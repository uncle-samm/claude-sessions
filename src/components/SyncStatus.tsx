import { useSyncState } from "../services/SyncContext";
import { useAuth } from "../hooks/useAuth";
import "./SyncStatus.css";

export function SyncStatus() {
  const { isAuthenticated } = useAuth();
  const syncState = useSyncState();

  // Don't show anything if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  const getStatusIcon = () => {
    switch (syncState.status) {
      case "syncing":
        return "↻";
      case "error":
        return "!";
      case "offline":
        return "○";
      case "idle":
      default:
        return "✓";
    }
  };

  const getStatusText = () => {
    switch (syncState.status) {
      case "syncing":
        return "Syncing...";
      case "error":
        return `Error${syncState.pendingCount > 0 ? ` (${syncState.pendingCount} pending)` : ""}`;
      case "offline":
        return `Offline${syncState.pendingCount > 0 ? ` (${syncState.pendingCount} pending)` : ""}`;
      case "idle":
      default:
        if (syncState.lastSyncAt) {
          const ago = getTimeAgo(syncState.lastSyncAt);
          return `Synced ${ago}`;
        }
        return "Synced";
    }
  };

  return (
    <div
      className={`sync-status sync-status--${syncState.status}`}
      title={syncState.error || getStatusText()}
    >
      <span className="sync-status__icon">{getStatusIcon()}</span>
      <span className="sync-status__text">{getStatusText()}</span>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
