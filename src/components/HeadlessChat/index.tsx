import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useMessageStore, ChatMessage, ContentBlock, AssistantMessage } from "../../store/messages";
import { useSessionStore } from "../../store/sessions";
import { useSettingsStore, PermissionMode } from "../../store/settings";
import { useTodosStore, extractTodosFromToolInput } from "../../store/todos";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { TodoList } from "./TodoList";
import "./styles.css";

interface HeadlessChatProps {
  sessionId: string;
  cwd: string;
  isActive: boolean;
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
  message?: AssistantMessage;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
}

interface ClaudeError {
  session_id: string;
  error: string;
}

interface ClaudeDone {
  session_id: string;
  exit_code?: number;
}

export function HeadlessChat({ sessionId, cwd, isActive }: HeadlessChatProps) {
  const { addMessage, addUserMessage, setSessionInfo, setLoading, setError, getMessages, getSessionInfo, setMessages } = useMessageStore();
  const { isLoading, error } = useMessageStore();
  const { setClaudeBusy, updateActivity } = useSessionStore();
  const { thinkingEnabled, permissionMode, todosPanelVisible, toggleThinking, cyclePermissionMode, toggleTodosPanel, toggleVerboseMode } = useSettingsStore();
  const { setTodos, getTodos } = useTodosStore();

  const messages = getMessages(sessionId);
  const sessionInfo = getSessionInfo(sessionId);
  const loading = isLoading[sessionId] || false;
  const sessionError = error[sessionId];
  const todos = getTodos(sessionId);

  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasLoadedHistory = useRef(false);

  // Handle incoming Claude messages
  const handleClaudeMessage = useCallback((event: { payload: ClaudeEvent }) => {
    const { session_id, message } = event.payload;
    if (session_id !== sessionId) return;

    updateActivity(sessionId);

    if (message.type === "system" && message.subtype === "init") {
      // Initial message with session info
      setSessionInfo(sessionId, {
        claudeSessionId: message.session_id,
        tools: message.tools,
      });
      // Claude is now busy processing
      setClaudeBusy(sessionId, true);
    } else if (message.type === "assistant" && message.message) {
      // Assistant response
      const content: ContentBlock[] = message.message.content || [];

      // Check for TodoWrite tool calls and extract todos
      for (const block of content) {
        if (block.type === "tool_use" && "name" in block && block.name === "TodoWrite") {
          const todos = extractTodosFromToolInput((block as { input: unknown }).input);
          if (todos.length > 0) {
            setTodos(sessionId, todos);
          }
        }
      }

      const chatMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        type: "assistant",
        content,
        timestamp: Date.now(),
      };
      addMessage(sessionId, chatMessage);
    } else if (message.type === "result") {
      // Final result
      setLoading(sessionId, false);
      setClaudeBusy(sessionId, false);

      if (message.subtype === "error") {
        setError(sessionId, message.result || "Unknown error");
      }
    }
  }, [sessionId, addMessage, setSessionInfo, setLoading, setError, setClaudeBusy, updateActivity, setTodos]);

  // Handle stderr output (usually progress/debug info)
  const handleClaudeStderr = useCallback((event: { payload: ClaudeError }) => {
    if (event.payload.session_id !== sessionId) return;
    console.log("[HeadlessChat] stderr:", event.payload.error);
  }, [sessionId]);

  // Handle Claude process done
  const handleClaudeDone = useCallback((event: { payload: ClaudeDone }) => {
    if (event.payload.session_id !== sessionId) return;
    setLoading(sessionId, false);
    setClaudeBusy(sessionId, false);

    if (event.payload.exit_code !== 0) {
      setError(sessionId, `Claude exited with code ${event.payload.exit_code}`);
    }
  }, [sessionId, setLoading, setClaudeBusy, setError]);

  // Load session history on mount
  useEffect(() => {
    if (!isActive || hasLoadedHistory.current) return;
    if (!sessionInfo?.claudeSessionId) return;

    const loadHistory = async () => {
      try {
        console.log("[HeadlessChat] Loading session history for:", sessionInfo.claudeSessionId);
        const messages = await invoke<Array<{
          id: string;
          msg_type: string;
          content: unknown;
          timestamp?: string;
          model?: string;
        }>>("load_claude_session_messages", {
          claudeSessionId: sessionInfo.claudeSessionId,
          projectPath: cwd,
        });

        if (messages.length > 0) {
          // Convert to ChatMessage format
          const chatMessages: ChatMessage[] = messages.map((msg) => ({
            id: msg.id,
            type: msg.msg_type as "user" | "assistant",
            content: Array.isArray(msg.content)
              ? (msg.content as ContentBlock[])
              : [{ type: "text" as const, text: String(msg.content) }],
            timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
          }));

          setMessages(sessionId, chatMessages);
          hasLoadedHistory.current = true;
          console.log("[HeadlessChat] Loaded", chatMessages.length, "messages from history");
        }
      } catch (err) {
        console.log("[HeadlessChat] Could not load session history:", err);
      }
    };

    loadHistory();
  }, [isActive, sessionId, sessionInfo?.claudeSessionId, cwd, setMessages]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in input
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        // Only handle Tab/Shift+Tab in input if not focused
        return;
      }

      // Tab: Toggle thinking mode
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleThinking();
        return;
      }

      // Shift+Tab: Cycle permission mode
      if (e.key === "Tab" && e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        cyclePermissionMode();
        return;
      }

      // Ctrl+T: Toggle todos panel
      if (e.key === "t" && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleTodosPanel();
        return;
      }

      // Ctrl+O: Toggle verbose mode
      if (e.key === "o" && e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleVerboseMode();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, toggleThinking, cyclePermissionMode, toggleTodosPanel, toggleVerboseMode]);

  // Start listening to events and optionally start Claude
  useEffect(() => {
    if (!isActive) return;

    const setupListeners = async () => {
      const unsub1 = await listen<ClaudeEvent>("claude-message", handleClaudeMessage);
      const unsub2 = await listen<ClaudeError>("claude-stderr", handleClaudeStderr);
      const unsub3 = await listen<ClaudeDone>("claude-done", handleClaudeDone);
      unlistenRefs.current = [unsub1, unsub2, unsub3];
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach((unsub) => unsub());
      unlistenRefs.current = [];
    };
  }, [isActive, handleClaudeMessage, handleClaudeStderr, handleClaudeDone]);

  // Send a message
  const sendMessage = useCallback(async (text: string) => {
    // Add user message to UI immediately
    addUserMessage(sessionId, text);
    setLoading(sessionId, true);
    setError(sessionId, null);
    setClaudeBusy(sessionId, true);

    try {
      // Get existing Claude session ID for resuming
      const resumeId = sessionInfo?.claudeSessionId;

      await invoke("start_claude_headless", {
        sessionId,
        prompt: text,
        cwd,
        resumeId: resumeId || null,
      });
    } catch (err) {
      setError(sessionId, String(err));
      setLoading(sessionId, false);
      setClaudeBusy(sessionId, false);
    }
  }, [sessionId, cwd, sessionInfo, addUserMessage, setLoading, setError, setClaudeBusy]);

  if (!isActive) {
    return null;
  }

  // Get mode indicator text
  const getModeIndicator = (mode: PermissionMode): string => {
    switch (mode) {
      case "acceptEdits": return "Auto-accept";
      case "plan": return "Plan mode";
      default: return "";
    }
  };

  return (
    <div className="headless-chat">
      <div className="headless-chat-header">
        <div className="header-title">
          <span className="header-icon">🤖</span>
          <span>Claude</span>
          {sessionInfo?.claudeSessionId && (
            <span className="header-session-id" title={sessionInfo.claudeSessionId}>
              Session: {sessionInfo.claudeSessionId.slice(0, 8)}...
            </span>
          )}
        </div>
        {loading && (
          <div className="header-status">
            <div className="status-spinner" />
            <span>Processing...</span>
          </div>
        )}
      </div>

      {sessionError && (
        <div className="headless-chat-error">
          <span className="error-icon">⚠️</span>
          <span>{sessionError}</span>
          <button onClick={() => setError(sessionId, null)} className="error-dismiss">×</button>
        </div>
      )}

      <div className="headless-chat-content">
        <MessageList messages={messages} isLoading={loading} />

        {/* TodoWrite panel - sticky at bottom */}
        {todosPanelVisible && todos.length > 0 && (
          <TodoList todos={todos} sessionId={sessionId} />
        )}
      </div>

      <InputArea
        onSubmit={sendMessage}
        disabled={loading}
        placeholder={
          messages.length === 0
            ? "What would you like Claude to help you with?"
            : "Continue the conversation..."
        }
      />

      {/* Status bar with mode badges and keyboard hints */}
      <div className="status-bar">
        <div className="status-badges">
          {thinkingEnabled && (
            <span className="mode-badge thinking" title="Press Tab to toggle">
              Thinking
            </span>
          )}
          {permissionMode !== "normal" && (
            <span className={`mode-badge ${permissionMode}`} title="Press Shift+Tab to cycle">
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
