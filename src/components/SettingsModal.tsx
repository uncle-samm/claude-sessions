import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSettingsStore } from "../store/settings";
import { SyncStatus } from "./SyncStatus";
import { useSync } from "../services/SyncContext";
import "./SettingsModal.css";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { isAuthenticated, isLoading, user, signIn, signOut } = useAuth();
  const { debugPauseAfterSetup, toggleDebugPauseAfterSetup } = useSettingsStore();
  const { triggerFullSync } = useSync();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cancelRef.current) {
        cancelRef.current();
      }
    };
  }, []);

  // Reset signing in state when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setSigningIn(false);
      cancelRef.current = null;
    }
  }, [isAuthenticated]);

  if (!isOpen) return null;

  const handleSignIn = (provider: "google") => {
    setSigningIn(true);
    setError(null);
    const { cancel } = signIn(provider);
    cancelRef.current = cancel;
  };

  const handleCancelSignIn = () => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setSigningIn(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out failed");
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        data-testid="settings-modal"
      >
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-content">
          {/* Account Section */}
          <section className="settings-section">
            <h3>Account</h3>

            {isLoading ? (
              <div className="auth-loading">Loading...</div>
            ) : isAuthenticated && user ? (
              <div className="auth-profile">
                <div className="profile-info">
                  {user.image && (
                    <img
                      src={user.image}
                      alt={user.name || "User"}
                      className="profile-avatar"
                    />
                  )}
                  <div className="profile-details">
                    <span className="profile-name">{user.name || "User"}</span>
                    {user.email && (
                      <span className="profile-email">{user.email}</span>
                    )}
                  </div>
                </div>
                <div className="sync-section">
                  <SyncStatus />
                  <button
                    className="sync-now-btn"
                    onClick={() => triggerFullSync()}
                    title="Sync all data now"
                  >
                    Sync Now
                  </button>
                </div>
                <button className="sign-out-btn" onClick={handleSignOut}>
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="auth-anonymous">
                <p className="auth-description">
                  Sign in to sync your sessions across devices. Your data is
                  stored locally and works offline.
                </p>

                {error && <div className="auth-error">{error}</div>}

                <div className="auth-buttons">
                  {signingIn ? (
                    <div className="signing-in-state">
                      <p>Complete sign-in in your browser...</p>
                      <button
                        className="cancel-btn"
                        onClick={handleCancelSignIn}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="auth-btn google"
                      onClick={() => handleSignIn("google")}
                      disabled={signingIn}
                    >
                      <svg viewBox="0 0 24 24" className="auth-icon">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Sign in with Google
                    </button>
                  )}
                </div>

                <p className="auth-note">
                  Currently in <strong>offline mode</strong>. All data is saved
                  locally.
                </p>
              </div>
            )}
          </section>

          {/* Developer Options */}
          <section className="settings-section">
            <h3>Developer</h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={debugPauseAfterSetup}
                onChange={toggleDebugPauseAfterSetup}
              />
              <span>Pause after workspace setup</span>
            </label>
            <p className="settings-hint">
              When enabled, waits for user input before starting Claude after
              workspace setup completes.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
