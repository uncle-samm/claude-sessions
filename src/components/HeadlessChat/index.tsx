import { useEffect, useCallback, useRef } from "react";
// Note: useRef is still used for unlistenRefs
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useMessageStore, ChatMessage, ContentBlock, AssistantMessage } from "../../store/messages";
import { useSessionStore } from "../../store/sessions";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
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
  const { addMessage, addUserMessage, setSessionInfo, setLoading, setError, getMessages, getSessionInfo } = useMessageStore();
  const { isLoading, error } = useMessageStore();
  const { setClaudeBusy, updateActivity } = useSessionStore();

  const messages = getMessages(sessionId);
  const sessionInfo = getSessionInfo(sessionId);
  const loading = isLoading[sessionId] || false;
  const sessionError = error[sessionId];

  const unlistenRefs = useRef<UnlistenFn[]>([]);

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
  }, [sessionId, addMessage, setSessionInfo, setLoading, setError, setClaudeBusy, updateActivity]);

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
            <span>Working...</span>
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

      <MessageList messages={messages} isLoading={loading} />

      <InputArea
        onSubmit={sendMessage}
        disabled={loading}
        placeholder={
          messages.length === 0
            ? "What would you like Claude to help you with?"
            : "Continue the conversation..."
        }
      />
    </div>
  );
}
