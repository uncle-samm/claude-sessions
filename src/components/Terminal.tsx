import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { spawn, IPty } from "tauri-pty";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  sessionId: string;
  cwd: string;
  isActive: boolean;
  phase: "running_claude" | string;
  isRestored?: boolean;
}

export function Terminal({ sessionId, cwd, isActive, phase, isRestored }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ptyRef = useRef<IPty | null>(null);
  const hasInitialized = useRef(false);
  const isActiveRef = useRef(isActive);
  const [error, setError] = useState<string | null>(null);

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

    setTimeout(() => {
      fitAddon.fit();
      console.log("[Terminal] After fit - cols:", terminal.cols, "rows:", terminal.rows);
      terminal.focus();
      spawnPty();
    }, 100);

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
          },
        });

        ptyRef.current = pty;

        pty.onData((data) => {
          // Skip empty data events and bare newlines (common with PTY during processing)
          if (data.length === 0) return;
          if (data === '\n' || data === '\r' || data === '\r\n') return;
          terminal.write(data);
        });

        pty.onExit(({ exitCode }) => {
          terminal.write(`\r\n[Claude exited with code ${exitCode}]\r\n`);
        });

        terminal.onData((data) => {
          pty.write(data);
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

    const handleResize = () => {
      if (fitAddonRef.current && isActiveRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (ptyRef.current) {
        ptyRef.current.kill();
      }
      // Clean up global terminal reference
      if ((window as any).__CLAUDE_SESSIONS_TERMINALS__?.[sessionId]) {
        delete (window as any).__CLAUDE_SESSIONS_TERMINALS__[sessionId];
      }
      terminal.dispose();
      hasInitialized.current = false;
    };
  }, [phase, sessionId, cwd, isRestored]);

  const focusTerminal = () => {
    if (terminalRef.current) {
      terminalRef.current.focus();
    }
  };

  // Don't render if not in running_claude phase
  if (phase !== "running_claude") {
    return null;
  }

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
