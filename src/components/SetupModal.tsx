import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { spawn, IPty } from "tauri-pty";
import { Session, useSessionStore } from "../store/sessions";
import { useSettingsStore } from "../store/settings";
import { configureWorktree, updateSessionCwd, getWorkspaces, getCommitSha, updateSessionBaseCommit } from "../store/api";
import { useWorkspaceStore } from "../store/workspaces";

const CWD_MARKER = "___CLAUDE_SESSIONS_CWD_MARKER___";

interface SetupModalProps {
  session: Session;
  isActive: boolean;
}

export function SetupModal({ session, isActive }: SetupModalProps) {
  const { setPhase, removeSession, setBaseCommit, setCwd } = useSessionStore();
  const debugPauseAfterSetup = useSettingsStore((s) => s.debugPauseAfterSetup);
  const { workspaces } = useWorkspaceStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const outputRef = useRef<string>("");
  const finalCwdRef = useRef<string>("");
  const hasInitialized = useRef(false);
  const [isError, setIsError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);

  const handleContinue = () => {
    if (!finalCwdRef.current) return;

    // Transition to ready, then to running_claude
    setPhase(session.id, { type: "ready", finalCwd: finalCwdRef.current });

    setTimeout(() => {
      setPhase(session.id, { type: "running_claude" });
    }, 100);

    // New workspace sessions should NOT use --continue since the worktree is brand new
    // Only restored sessions (isRestored flag) should use --continue
  };

  const runScript = async () => {
    if (!containerRef.current || !session.scriptPath) {
      return;
    }

    // Reset state for retry
    setIsError(false);
    setIsReady(false);
    setExitCode(null);
    outputRef.current = "";
    finalCwdRef.current = "";

    const workspace = workspaces.find((w) => w.id === session.workspaceId);

    // Create terminal for script output
    const terminal = new XTerm({
      cursorBlink: false,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
      },
      disableStdin: true,
    });

    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    setTimeout(() => {
      fitAddon.fit();
    }, 50);

    try {
      // Build the script command with cwd marker at the end
      // Export worktree name as env var, source the script, then output marker and pwd
      const envParts: string[] = [];
      if (session.worktreeName) {
        envParts.push(`export CLAUDE_WORKTREE_NAME="${session.worktreeName}"`);
      }
      if (workspace?.originBranch) {
        envParts.push(`export CLAUDE_ORIGIN_BRANCH="${workspace.originBranch}"`);
      }
      const envExport = envParts.length > 0 ? `${envParts.join(" && ")} && ` : "";
      const scriptCmd = `${envExport}source "${session.scriptPath}" && echo "${CWD_MARKER}" && pwd && exit 0`;

      const pty = await spawn("/bin/zsh", ["-c", scriptCmd], {
        cols: terminal.cols,
        rows: terminal.rows,
        cwd: session.cwd || undefined,
      });

      ptyRef.current = pty;

      pty.onData((data) => {
        terminal.write(data);
        outputRef.current += data;
      });

      pty.onExit(async ({ exitCode: code }) => {
        setExitCode(code);

        // Wait a bit for any remaining PTY data to be received
        // This fixes a race condition where onExit fires before all onData calls complete
        await new Promise(resolve => setTimeout(resolve, 100));

        if (code === 0) {
          // Parse the output to find the final cwd
          const output = outputRef.current;
          const markerIndex = output.lastIndexOf(CWD_MARKER);

          if (markerIndex !== -1) {
            // Extract everything after the marker, find the pwd line
            const afterMarker = output.slice(markerIndex + CWD_MARKER.length);
            // Remove ANSI codes and find the path
            const cleanOutput = afterMarker.replace(/\x1b\[[0-9;]*m/g, "").trim();
            const lines = cleanOutput.split("\n").map((l) => l.trim()).filter(Boolean);
            const finalCwd = lines[0];

            if (finalCwd && finalCwd.startsWith("/")) {
              finalCwdRef.current = finalCwd;
              terminal.write("\r\n\x1b[32m✓ Setup complete!\x1b[0m\r\n");
              terminal.write(`\x1b[90mWorking directory: ${finalCwd}\x1b[0m\r\n`);

              // Update session cwd in database and configure MCP in the worktree
              terminal.write("\x1b[90mConfiguring MCP...\x1b[0m\r\n\r\n");
              Promise.all([
                updateSessionCwd(session.id, finalCwd),
                configureWorktree(finalCwd, session.id)
              ])
                .then(async () => {
                  setCwd(session.id, finalCwd);

                  // Capture the base commit SHA for stable diffs
                  if (session.workspaceId) {
                    try {
                      const workspaces = await getWorkspaces();
                      const workspace = workspaces.find(w => w.id === session.workspaceId);
                      if (workspace) {
                        // Use HEAD to get the worktree's current commit, not origin
                        // This ensures diff only shows changes made in this session
                        const commitSha = await getCommitSha(finalCwd, "HEAD");
                        await updateSessionBaseCommit(session.id, commitSha);
                        setBaseCommit(session.id, commitSha);  // Update store too
                        terminal.write(`\x1b[90mBase commit: ${commitSha.slice(0, 8)}\x1b[0m\r\n`);
                      }
                    } catch (err) {
                      // Non-fatal: just log and continue without base commit
                      terminal.write(`\x1b[33mNote: Could not capture base commit: ${err}\x1b[0m\r\n`);
                    }
                  }

                  if (debugPauseAfterSetup) {
                    terminal.write("\x1b[1mPress Enter to start Claude...\x1b[0m");
                    setIsReady(true);
                  } else {
                    // Auto-continue without waiting
                    terminal.write("\x1b[90mStarting Claude...\x1b[0m");
                    setTimeout(() => {
                      setPhase(session.id, { type: "ready", finalCwd });
                      setTimeout(() => {
                        setPhase(session.id, { type: "running_claude" });
                      }, 100);
                    }, 500);
                  }
                })
                .catch((err) => {
                  terminal.write(`\r\n\x1b[31mFailed to configure MCP: ${err}\x1b[0m\r\n`);
                  setIsError(true);
                });
            } else {
              terminal.write("\r\n\x1b[31mError: Could not determine working directory\x1b[0m\r\n");
              setIsError(true);
            }
          } else {
            terminal.write("\r\n\x1b[31mError: Script did not complete successfully\x1b[0m\r\n");
            setIsError(true);
          }
        } else {
          terminal.write(`\r\n\x1b[31mScript exited with code ${code}\x1b[0m\r\n`);
          setIsError(true);
          setPhase(session.id, {
            type: "script_error",
            exitCode: code,
            output: outputRef.current.split("\n"),
          });
        }
      });
    } catch (err) {
      terminal.write(`\r\n\x1b[31mFailed to run script: ${err}\x1b[0m\r\n`);
      setIsError(true);
    }
  };

  // Handle keyboard events for Enter to continue
  useEffect(() => {
    if (!isReady || !isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        handleContinue();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReady, isActive]);

  useEffect(() => {
    if (hasInitialized.current) return;
    if (session.phase.type !== "running_script") return;

    hasInitialized.current = true;
    runScript();

    return () => {
      if (ptyRef.current) {
        ptyRef.current.kill();
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
      }
      hasInitialized.current = false;
    };
  }, [session.phase.type]);

  const handleRetry = () => {
    if (ptyRef.current) {
      ptyRef.current.kill();
      ptyRef.current = null;
    }
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
    hasInitialized.current = false;

    setPhase(session.id, { type: "running_script", output: [] });
    setTimeout(() => {
      runScript();
      hasInitialized.current = true;
    }, 100);
  };

  const handleCancel = () => {
    if (ptyRef.current) {
      ptyRef.current.kill();
    }
    removeSession(session.id);
  };

  return (
    <div className="setup-modal-overlay" style={{ display: isActive ? 'flex' : 'none' }}>
      <div className="setup-modal">
        <div className="setup-modal-header">
          <h3>{isReady ? "Setup complete!" : "Setting up workspace..."}</h3>
          {!isError && !isReady && exitCode === null && (
            <span className="setup-spinner"></span>
          )}
          {isReady && (
            <span className="setup-success">✓</span>
          )}
        </div>

        <div className="setup-modal-content">
          <div
            ref={containerRef}
            className="setup-terminal"
          />
        </div>

        <div className="setup-modal-actions">
          {isReady && (
            <button className="setup-btn setup-btn-continue" onClick={handleContinue}>
              Continue (Enter)
            </button>
          )}
          {isError && (
            <>
              <button className="setup-btn setup-btn-retry" onClick={handleRetry}>
                Retry
              </button>
              <button className="setup-btn setup-btn-cancel" onClick={handleCancel}>
                Cancel
              </button>
            </>
          )}
          {!isReady && !isError && (
            <button className="setup-btn setup-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
