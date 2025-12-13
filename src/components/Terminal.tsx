import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { spawn, IPty } from "tauri-pty";
import { useSessionStore } from "../store/sessions";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  cwd: string;
  isActive: boolean;
  phase: "running_claude" | "idle" | string;
  isRestored?: boolean;
}

export function Terminal({ sessionId, cwd, isActive, phase, isRestored }: TerminalProps) {
  const updateActivity = useSessionStore((s) => s.updateActivity);
  const setClaudeBusy = useSessionStore((s) => s.setClaudeBusy);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const hasInitialized = useRef(false);
  const isActiveRef = useRef(isActive);
  const [error, setError] = useState<string | null>(null);

  // Refs for stability improvements
  const busyTimeoutRef = useRef<number | null>(null);
  const isBusyRef = useRef(false);
  const pendingDataRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);

  // Keep isActiveRef in sync
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Focus when becoming active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      setTimeout(() => {
        terminalRef.current?.focus();
      }, 50);
    }
  }, [isActive]);

  // Initialize terminal when phase is running_claude
  useEffect(() => {
    if (phase !== "running_claude") return;
    if (hasInitialized.current || !containerRef.current) return;

    hasInitialized.current = true;

    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
      theme: {
        background: "#1a1a1a",
        foreground: "#f5f5f5",
        cursor: "#f5f5f5",
      },
    });

    terminalRef.current = terminal;

    // Expose terminal globally for MCP automation and debugging (dev mode only)
    if (import.meta.env.DEV) {
      (window as any).__CLAUDE_SESSIONS_TERMINALS__ = (window as any).__CLAUDE_SESSIONS_TERMINALS__ || {};
      // Helper to get any terminal by ID or the current one
      (window as any).__getTerminal__ = (id?: string) => {
        const terminals = (window as any).__CLAUDE_SESSIONS_TERMINALS__;
        if (id) return terminals[id];
        // Return first terminal if no ID specified
        const keys = Object.keys(terminals);
        return keys.length > 0 ? terminals[keys[0]] : null;
      };
      (window as any).__CLAUDE_SESSIONS_TERMINALS__[sessionId] = {
        terminal,
        refresh: () => terminal.refresh(0, terminal.rows - 1),
        fit: () => fitAddonRef.current?.fit(),
        // Debug methods for interacting with the terminal
        write: (text: string) => ptyRef.current?.write(text),
        writeLine: (text: string) => ptyRef.current?.write(text + '\r'),
        getBuffer: () => {
          const buffer = terminal.buffer.active;
          const lines: string[] = [];
          for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (line) lines.push(line.translateToString(true));
          }
          return lines.join('\n');
        },
        getLastLines: (n: number) => {
          const buffer = terminal.buffer.active;
          const lines: string[] = [];
          const start = Math.max(0, buffer.baseY + buffer.cursorY - n);
          for (let i = start; i <= buffer.baseY + buffer.cursorY; i++) {
            const line = buffer.getLine(i);
            if (line) lines.push(line.translateToString(true));
          }
          return lines.join('\n');
        },
      };
    }

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);

    // Load WebGL addon for GPU-accelerated rendering (much faster than DOM/Canvas)
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        console.warn("[Terminal] WebGL context lost, disposing addon");
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
      console.log("[Terminal] WebGL renderer loaded successfully");
    } catch (e) {
      console.warn("[Terminal] WebGL not available, using default renderer:", e);
    }

    setTimeout(() => {
      fitAddon.fit();
      console.log("[Terminal] After fit - cols:", terminal.cols, "rows:", terminal.rows);
      terminal.focus();
      spawnPty();
    }, 100);

    // Process busy detection on batched data with debouncing
    const processBusyDetection = (data: string) => {
      if (data.includes("to interrupt)")) {
        // Clear any pending "not busy" timeout
        if (busyTimeoutRef.current) {
          clearTimeout(busyTimeoutRef.current);
          busyTimeoutRef.current = null;
        }
        if (!isBusyRef.current) {
          isBusyRef.current = true;
          setClaudeBusy(sessionId, true);
        }
      } else if (isBusyRef.current) {
        // Only set not-busy after 300ms of no "to interrupt)" messages
        if (!busyTimeoutRef.current) {
          busyTimeoutRef.current = window.setTimeout(() => {
            isBusyRef.current = false;
            setClaudeBusy(sessionId, false);
            busyTimeoutRef.current = null;
          }, 300);
        }
      }
    };

    const spawnPty = async () => {
      try {
        // Use --continue for restored sessions (they already have Claude history)
        const claudeCmd = isRestored ? "claude --continue" : "claude";
        console.log("[Terminal] Spawning PTY with command:", claudeCmd, "cwd:", cwd);

        // Spawn a shell that sources profile for PATH setup
        // Using -l (login) to get PATH, -c to run command
        const pty = await spawn("/bin/zsh", ["-l", "-c", claudeCmd], {
          cols: terminal.cols,
          rows: terminal.rows,
          cwd: cwd || undefined,
          env: {
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            LANG: "en_US.UTF-8",
            LC_ALL: "en_US.UTF-8",
          },
        });

        ptyRef.current = pty;

        // Batch PTY data writes with requestAnimationFrame for stability
        // Note: Claude Code has a known bug where it inserts hard line breaks at ~80 chars
        // See: https://github.com/anthropics/claude-code/issues/7670
        pty.onData((data) => {
          // Skip truly empty data
          if (data.length === 0) return;

          // Accumulate data for batched writing
          pendingDataRef.current += data;

          // Schedule batched write on next animation frame
          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
              if (pendingDataRef.current) {
                terminal.write(pendingDataRef.current);
                // Process busy detection on batched data
                processBusyDetection(pendingDataRef.current);
                // Track activity for auto-idle detection
                updateActivity(sessionId);
                pendingDataRef.current = "";
              }
              rafIdRef.current = null;
            });
          }
        });

        pty.onExit(({ exitCode }) => {
          terminal.write(`\r\n[Claude exited with code ${exitCode}]\r\n`);
        });

        terminal.onData((data) => {
          pty.write(data);
          // Track activity when user types
          updateActivity(sessionId);
        });

        terminal.onResize(({ cols, rows }) => {
          console.log("[Terminal] onResize fired:", cols, "x", rows);
          pty.resize(cols, rows);
        });
      } catch (err) {
        const errMsg = String(err);
        terminal.write(`\r\n[Failed to spawn PTY: ${errMsg}]\r\n`);
        setError(errMsg);
      }
    };

    // Debounced resize handler to prevent layout thrashing
    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        if (fitAddonRef.current && isActiveRef.current) {
          fitAddonRef.current.fit();
        }
        resizeTimeoutRef.current = null;
      }, 50);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      // Clear all timers
      if (busyTimeoutRef.current) {
        clearTimeout(busyTimeoutRef.current);
        busyTimeoutRef.current = null;
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      if (ptyRef.current) {
        ptyRef.current.kill();
      }
      // Clean up global terminal reference
      if ((window as any).__CLAUDE_SESSIONS_TERMINALS__?.[sessionId]) {
        delete (window as any).__CLAUDE_SESSIONS_TERMINALS__[sessionId];
      }
      terminal.dispose();
      hasInitialized.current = false;
      isBusyRef.current = false;
      pendingDataRef.current = "";
    };
  }, [phase, sessionId, cwd, isRestored]);

  const focusTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  };

  // Don't render if not in running_claude phase (idle sessions have no terminal)
  if (phase !== "running_claude") {
    return null;
  }

  // For idle sessions, show a placeholder that will activate on click
  // (handled in Sidebar - click activates session which changes phase)

  if (error) {
    return (
      <div
        className="terminal-container"
        style={{
          visibility: isActive ? "visible" : "hidden",
          position: isActive ? "relative" : "absolute",
        }}
      >
        <div style={{ padding: 20, color: "#ff6b6b", backgroundColor: "#1a1a1a", height: "100%" }}>
          <h2>Terminal Error</h2>
          <pre>{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div
      className="terminal-container"
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#1a1a1a",
        visibility: isActive ? "visible" : "hidden",
        position: isActive ? "relative" : "absolute",
      }}
      onClick={focusTerminal}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", cursor: "text" }}
      />
    </div>
  );
}
