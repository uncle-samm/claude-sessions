import { useEffect, useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ContentBlock, AssistantMessage, ToolResultContent, ToolUseContent } from "../../store/messages";
import { useSessionStore } from "../../store/sessions";
import { useSettingsStore, PermissionMode } from "../../store/settings";
import { extractTodosFromToolInput } from "../../store/todos";
import { useTouchedFilesStore } from "../../store/touchedFiles";
import {
  useConvexSession,
  useConvexMessages,
  useConvexTodos,
} from "../../hooks/useConvexMessages";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { TodoList } from "./TodoList";
import "./styles.css";

interface HeadlessChatProps {
  sessionId: string;
  cwd: string;
  isActive: boolean;
  sessionName?: string;
}

// Types for Tauri events
interface ClaudeEvent {
  session_id: string;
  message: ClaudeMessagePayload;
}

interface ClaudeMessagePayload {
  type: "system" | "user" | "assistant" | "result";
  subtype?: string;
  session_id?: string;
  tools?: string[];
  message?: AssistantMessage | { content?: ContentBlock[]; model?: string; role?: string };
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  uuid?: string;
}

function getMessageContent(message: ClaudeMessagePayload["message"]): ContentBlock[] {
  if (!message || typeof message !== "object") return [];
  const content = (message as { content?: unknown }).content;
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

function normalizeFilePath(rawPath: string, cwd: string): string {
  let cleaned = rawPath.trim().replace(/\\/g, "/");
  const normalizedCwd = cwd.replace(/\\/g, "/").replace(/\/$/, "");
  if (normalizedCwd && cleaned.startsWith(`${normalizedCwd}/`)) {
    cleaned = cleaned.slice(normalizedCwd.length + 1);
  }
  if (cleaned.startsWith("./")) {
    cleaned = cleaned.slice(2);
  }
  cleaned = cleaned.replace(/^\/+/, "");
  const parts = cleaned.split("/");
  const normalizedParts: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (normalizedParts.length > 0) {
        normalizedParts.pop();
      }
      continue;
    }
    normalizedParts.push(part);
  }
  return normalizedParts.join("/");
}

// Extract base tool name from potential MCP-prefixed name
// e.g., "mcp__acp__Edit" -> "edit", "Edit" -> "edit"
function extractBaseToolName(name: string): string {
  // Strip MCP prefix pattern: mcp__<server>__<tool>
  const mcpMatch = name.match(/^mcp__[^_]+__(.+)$/);
  const baseName = mcpMatch ? mcpMatch[1] : name;
  return baseName.toLowerCase().replace(/[^a-z]/g, "");
}

function extractTouchedFiles(blocks: ContentBlock[], cwd: string): string[] {
  const touched: string[] = [];
  const writeToolNames = new Set([
    "edit",
    "write",
    "multiedit",
    "applypatch",
    "notebookedit",
    "notebookwrite",
    "editfile",
    "writefile",
  ]);
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const tool = block as ToolUseContent;
    const input = tool.input as Record<string, unknown>;
    const filePath =
      (typeof input.file_path === "string" ? input.file_path : undefined) ||
      (typeof input.filePath === "string" ? input.filePath : undefined) ||
      (typeof input.filepath === "string" ? input.filepath : undefined) ||
      (typeof input.path === "string" ? input.path : undefined) ||
      (typeof input.file === "string" ? input.file : undefined) ||
      (typeof input.filename === "string" ? input.filename : undefined);
    const notebookPath =
      (typeof input.notebook_path === "string" ? input.notebook_path : undefined) ||
      (typeof input.notebookPath === "string" ? input.notebookPath : undefined);
    const normalizedToolName = extractBaseToolName(tool.name);
    const isWriteTool = writeToolNames.has(normalizedToolName);

    if (isWriteTool && filePath) {
      touched.push(normalizeFilePath(filePath, cwd));
      continue;
    }

    if ((normalizedToolName === "notebookedit" || normalizedToolName === "notebookwrite") && notebookPath) {
      touched.push(normalizeFilePath(notebookPath, cwd));
    }
  }
  return touched;
}

interface ClaudeError {
  session_id: string;
  error: string;
}

interface ClaudeDone {
  session_id: string;
  exit_code?: number;
}

export function HeadlessChat({
  sessionId,
  cwd,
  isActive,
  sessionName,
}: HeadlessChatProps) {
  const { setClaudeBusy, updateActivity } = useSessionStore();
  const { addTouchedFiles } = useTouchedFilesStore();
  const {
    thinkingEnabled,
    permissionMode,
    todosPanelVisible,
    toggleThinking,
    cyclePermissionMode,
    toggleTodosPanel,
    toggleVerboseMode,
  } = useSettingsStore();

  // Convex integration for real-time sync
  const { convexSessionId, isLoading: sessionLoading } = useConvexSession(
    sessionId,
    cwd,
    sessionName || sessionId,
  );
  const {
    messages,
    addUserMessage,
    addAssistantMessage,
    isLoading: messagesLoading,
  } = useConvexMessages(convexSessionId);
  const { todos, setTodos } = useConvexTodos(convexSessionId);

  // Local state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);

  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const touchedSeededSession = useRef<string | null>(null);

  // Convert Convex messages to ChatMessage format for MessageList
  const chatMessages = messages.map((msg) => ({
    id: msg._id,
    type: msg.type,
    content: msg.content,
    timestamp: msg._creationTime,
    cost: msg.cost,
  }));

  // Convert Convex todos to the format TodoList expects
  const todoItems = todos.map((todo) => ({
    content: todo.content,
    activeForm: todo.activeForm,
    status: todo.status,
    priority: todo.priority,
  }));

  useEffect(() => {
    if (messagesLoading || !sessionId) return;
    // Only skip if we've already seeded AND we have messages (to avoid skipping when messages haven't loaded yet)
    if (touchedSeededSession.current === sessionId && messages.length > 0) return;

    const allBlocks = messages.flatMap((msg) => msg.content);
    const touchedFiles = extractTouchedFiles(allBlocks, cwd);
    if (touchedFiles.length > 0) {
      addTouchedFiles(sessionId, touchedFiles);
    }
    // Only mark as seeded if we have messages (so we re-run when messages load)
    if (messages.length > 0) {
      touchedSeededSession.current = sessionId;
    }
  }, [messagesLoading, messages, sessionId, cwd, addTouchedFiles]);

  // Handle incoming Claude messages - save to Convex for real-time sync
  const handleClaudeMessage = useCallback(
    async (event: { payload: ClaudeEvent }) => {
      const { session_id, message } = event.payload;
      if (session_id !== sessionId) return;

      updateActivity(sessionId);

      if (message.type === "system" && message.subtype === "init") {
        // Initial message with session info
        const claudeId = message.session_id;
        if (claudeId) {
          setClaudeSessionId(claudeId);
          // Persist to local DB as well for backwards compatibility
          invoke("update_session_claude_id", {
            id: sessionId,
            claudeSessionId: claudeId,
          }).catch((err) =>
            console.error(
              "[HeadlessChat] Failed to save claude_session_id:",
              err,
            ),
          );
        }
        setClaudeBusy(sessionId, true);
      } else if (message.type === "assistant" && message.message) {
        // Assistant response - save to Convex
        const assistantMessage = message.message as AssistantMessage;
        const content = getMessageContent(assistantMessage);

        // Filter out placeholder responses like "No response requested"
        const isPlaceholderResponse =
          content.length === 1 &&
          content[0].type === "text" &&
          "text" in content[0] &&
          (content[0] as { text: string }).text.trim() ===
            "No response requested.";

        if (isPlaceholderResponse) {
          console.log("[HeadlessChat] Skipping placeholder response");
          return;
        }

        const touchedFiles = extractTouchedFiles(content, cwd);
        if (touchedFiles.length > 0) {
          addTouchedFiles(sessionId, touchedFiles);
        }

        // Note: We no longer filter out MCP tool calls - they should be visible
        // just like Read, Edit, Bash, etc. Our custom tools (notify_ready,
        // get_pending_comments, etc.) are user-facing actions.

        // Check for TodoWrite tool calls and extract todos
        for (const block of content) {
          if (
            block.type === "tool_use" &&
            "name" in block &&
            block.name === "TodoWrite"
          ) {
            const extractedTodos = extractTodosFromToolInput(
              (block as { input: unknown }).input,
            );
            if (extractedTodos.length > 0 && convexSessionId) {
              setTodos(extractedTodos).catch((err) =>
                console.error("[HeadlessChat] Failed to save todos:", err),
              );
            }
          }
        }

        // Save to Convex for real-time sync
        if (convexSessionId) {
          try {
            await addAssistantMessage(content, {
              externalId: message.uuid,
              model: assistantMessage?.model,
            });
            console.log("[HeadlessChat] Saved assistant message to Convex");
          } catch (err) {
            console.error(
              "[HeadlessChat] Failed to save message to Convex:",
              err,
            );
          }
        }
      } else if (message.type === "user" && message.message) {
        const content = getMessageContent(message.message);
        const toolResults = content.filter(
          (block): block is ToolResultContent => block.type === "tool_result",
        );

        if (toolResults.length === 0) {
          return;
        }

        if (convexSessionId) {
          try {
            await addAssistantMessage(toolResults);
            console.log("[HeadlessChat] Saved tool result message to Convex");
          } catch (err) {
            console.error(
              "[HeadlessChat] Failed to save tool result to Convex:",
              err,
            );
          }
        }
      } else if (message.type === "result") {
        // Final result
        setLoading(false);
        setClaudeBusy(sessionId, false);

        if (message.subtype === "error") {
          setError(message.result || "Unknown error");
        }
      }
    },
    [
      sessionId,
      cwd,
      convexSessionId,
      addTouchedFiles,
      addAssistantMessage,
      setTodos,
      setClaudeBusy,
      updateActivity,
    ],
  );

  // Handle stderr output (usually progress/debug info)
  const handleClaudeStderr = useCallback(
    (event: { payload: ClaudeError }) => {
      if (event.payload.session_id !== sessionId) return;
      console.log("[HeadlessChat] stderr:", event.payload.error);
    },
    [sessionId],
  );

  // Handle Claude process done
  const handleClaudeDone = useCallback(
    (event: { payload: ClaudeDone }) => {
      if (event.payload.session_id !== sessionId) return;
      setLoading(false);
      setClaudeBusy(sessionId, false);

      if (event.payload.exit_code !== 0) {
        setError(`Claude exited with code ${event.payload.exit_code}`);
      }
    },
    [sessionId, setClaudeBusy],
  );

  // Load claude_session_id from database on mount
  useEffect(() => {
    if (!isActive) return;

    const loadClaudeSessionId = async () => {
      try {
        const storedId = await invoke<string | null>("get_session_claude_id", {
          id: sessionId,
        });
        if (storedId) {
          setClaudeSessionId(storedId);
          console.log(
            "[HeadlessChat] Loaded claude_session_id from DB:",
            storedId,
          );
        }
      } catch (err) {
        console.log("[HeadlessChat] Could not load claude_session_id:", err);
      }
    };

    loadClaudeSessionId();
  }, [isActive, sessionId]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleThinking();
        return;
      }

      if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        cyclePermissionMode();
        return;
      }

      if (e.key === "t" && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleTodosPanel();
        return;
      }

      if (e.key === "o" && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleVerboseMode();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isActive,
    toggleThinking,
    cyclePermissionMode,
    toggleTodosPanel,
    toggleVerboseMode,
  ]);

  // Start listening to Tauri events
  useEffect(() => {
    if (!isActive) return;

    const setupListeners = async () => {
      const unsub1 = await listen<ClaudeEvent>(
        "claude-message",
        handleClaudeMessage,
      );
      const unsub2 = await listen<ClaudeError>(
        "claude-stderr",
        handleClaudeStderr,
      );
      const unsub3 = await listen<ClaudeDone>("claude-done", handleClaudeDone);
      unlistenRefs.current = [unsub1, unsub2, unsub3];
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach((unsub) => unsub());
      unlistenRefs.current = [];
    };
  }, [isActive, handleClaudeMessage, handleClaudeStderr, handleClaudeDone]);

  // Send a message using the Agent SDK sidecar
  const sendMessage = useCallback(
    async (text: string) => {
      // Save user message to Convex first for immediate display
      if (convexSessionId) {
        try {
          await addUserMessage(text);
          console.log("[HeadlessChat] Saved user message to Convex");
        } catch (err) {
          console.error("[HeadlessChat] Failed to save user message:", err);
        }
      }

      setLoading(true);
      setError(null);
      setClaudeBusy(sessionId, true);

      // Map permission mode to SDK format
      const sdkPermissionMode =
        permissionMode === "acceptEdits"
          ? "acceptEdits"
          : permissionMode === "plan"
            ? "plan"
            : undefined; // "normal" -> default SDK behavior

      try {
        // Use the new Agent SDK sidecar command
        await invoke("start_claude_agent", {
          sessionId,
          prompt: text,
          cwd,
          resumeId: claudeSessionId || null,
          permissionMode: sdkPermissionMode,
        });
      } catch (err) {
        setError(String(err));
        setLoading(false);
        setClaudeBusy(sessionId, false);
      }
    },
    [
      sessionId,
      cwd,
      claudeSessionId,
      convexSessionId,
      addUserMessage,
      setClaudeBusy,
      permissionMode,
    ],
  );

  if (!isActive) {
    return null;
  }

  const getModeIndicator = (mode: PermissionMode): string => {
    switch (mode) {
      case "acceptEdits":
        return "Auto-accept";
      case "plan":
        return "Plan mode";
      default:
        return "";
    }
  };

  const isInitializing = sessionLoading || messagesLoading;

  return (
    <div className="headless-chat">
      <div className="headless-chat-header">
        <div className="header-title">
          <span className="header-icon" aria-hidden="true" />
          <span>Claude</span>
          {claudeSessionId && (
            <span className="header-session-id" title={claudeSessionId}>
              Session: {claudeSessionId.slice(0, 8)}...
            </span>
          )}
          {convexSessionId && (
            <span
              className="header-sync-badge"
              title="Synced to Convex"
              aria-label="Synced to Convex"
              role="img"
            />
          )}
        </div>
        {(loading || isInitializing) && (
          <div className="header-status">
            <div className="status-spinner" />
            <span>{isInitializing ? "Loading..." : "Processing..."}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="headless-chat-error">
          <span className="error-icon" aria-hidden="true" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="error-dismiss">
            ×
          </button>
        </div>
      )}

      <div className="headless-chat-content">
        <MessageList messages={chatMessages} isLoading={loading} />

        {todosPanelVisible && (
          <TodoList todos={todoItems} sessionId={sessionId} />
        )}
      </div>

      <InputArea
        onSubmit={sendMessage}
        disabled={loading || isInitializing}
        placeholder={
          chatMessages.length === 0
            ? "What would you like Claude to help you with?"
            : "Continue the conversation..."
        }
      />

      <div className="status-bar">
        <div className="status-badges">
          {thinkingEnabled && (
            <span className="mode-badge thinking" title="Press Tab to toggle">
              Thinking
            </span>
          )}
          {permissionMode !== "normal" && (
            <span
              className={`mode-badge ${permissionMode}`}
              title="Press Shift+Tab to cycle"
            >
              {getModeIndicator(permissionMode)}
            </span>
          )}
        </div>
        <div className="keyboard-hints">
          <span>Tab: thinking</span>
          <span>Shift+Tab: mode</span>
          <span>Ctrl+T: todos</span>
        </div>
      </div>
    </div>
  );
}
