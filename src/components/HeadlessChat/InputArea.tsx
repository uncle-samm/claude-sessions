import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useSettingsStore } from "../../store/settings";

interface InputAreaProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputArea({ onSubmit, disabled, placeholder }: InputAreaProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toggleThinking, cyclePermissionMode, toggleTodosPanel, toggleVerboseMode } = useSettingsStore();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [message]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSubmit(trimmed);
      setMessage("");
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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

  return (
    <div className="input-area" data-testid="input-area">
      <div className="input-container">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type a message... (Enter to send, Shift+Enter for newline)"}
          disabled={disabled}
          rows={1}
          className="input-textarea"
          data-testid="input-textarea"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !message.trim()}
          className="input-submit-btn"
          title="Send message"
          data-testid="send-btn"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="20"
            height="20"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <div className="input-hint">
        <span>Press <kbd>Enter</kbd> to send, <kbd>Shift+Enter</kbd> for new line</span>
      </div>
    </div>
  );
}
