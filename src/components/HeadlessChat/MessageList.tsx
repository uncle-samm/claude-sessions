import { useEffect, useRef } from "react";
import { ChatMessage, ContentBlock, ToolUseContent, ToolResultContent, ThinkingContent } from "../../store/messages";
import { ToolCall } from "./ToolCall";
import { ThinkingBlock } from "./ThinkingBlock";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

// Simple markdown-like rendering (basic support)
function renderText(text: string): React.ReactNode {
  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push(
        <span key={keyIndex++}>
          {renderInlineText(text.slice(lastIndex, match.index))}
        </span>
      );
    }

    // Add code block
    const language = match[1] || "plaintext";
    const code = match[2];
    parts.push(
      <pre key={keyIndex++} className={`code-block lang-${language}`}>
        <code>{code}</code>
      </pre>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={keyIndex++}>
        {renderInlineText(text.slice(lastIndex))}
      </span>
    );
  }

  return parts.length > 0 ? parts : renderInlineText(text);
}

// Render inline formatting (bold, italic, code)
function renderInlineText(text: string): React.ReactNode {
  // Handle inline code
  const inlineCodeRegex = /`([^`]+)`/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = inlineCodeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<code key={keyIndex++} className="inline-code">{match[1]}</code>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function isHiddenToolName(name: string): boolean {
  return name.startsWith("mcp__") || name === "TodoWrite";
}

function isHiddenToolBlock(block: ContentBlock): boolean {
  if (block.type !== "tool_use") return false;
  return isHiddenToolName((block as ToolUseContent).name);
}

// Render a single content block
function ContentBlockView({ block, toolResults }: { block: ContentBlock; toolResults: Map<string, { content?: unknown; is_error?: boolean }> }) {
  if (block.type === "text") {
    const textBlock = block as { type: "text"; text: string };
    return <div className="message-text">{renderText(textBlock.text)}</div>;
  }

  if (block.type === "thinking") {
    const thinkingBlock = block as ThinkingContent;
    return <ThinkingBlock thinking={thinkingBlock.thinking} />;
  }

  if (block.type === "tool_use") {
    const toolBlock = block as ToolUseContent;
    const result = toolResults.get(toolBlock.id);
    return (
      <div className="message-tool">
        <ToolCall
          tool={toolBlock}
          result={result?.content}
          isError={result?.is_error}
        />
      </div>
    );
  }

  // Skip tool_result blocks - they're handled alongside tool_use
  if (block.type === "tool_result") {
    return null;
  }

  // Unknown block type
  return (
    <div className="message-unknown">
      <pre>{JSON.stringify(block, null, 2)}</pre>
    </div>
  );
}

// Avatar component
function MessageAvatar({ type }: { type: string }) {
  const isUser = type === "user";
  const isAssistant = type === "assistant";

  return (
    <div className={`message-avatar ${type}`}>
      {isUser ? "U" : isAssistant ? "C" : "S"}
    </div>
  );
}

function Message({ message, toolResults }: { message: ChatMessage; toolResults: Map<string, { content?: unknown; is_error?: boolean }> }) {

  const isUser = message.type === "user";
  const isSystem = message.type === "system";
  const isError = message.type === "error";

  const visibleBlocks = message.content.filter((block) => {
    if (block.type === "tool_result") return false;
    if (isHiddenToolBlock(block)) return false;
    return true;
  });
  const hasVisibleBlocks = visibleBlocks.length > 0;
  const hasHiddenToolCalls = message.content.some((block) => isHiddenToolBlock(block));
  const hasTodoWrite = message.content.some(
    (block) => block.type === "tool_use" && (block as ToolUseContent).name === "TodoWrite",
  );
  const emptyTitle = hasTodoWrite
    ? "Todo list updated"
    : hasHiddenToolCalls
      ? "Tool update recorded"
      : "No displayable content";
  const emptyDetail = hasTodoWrite
    ? "Open the Todo panel to view tasks."
    : hasHiddenToolCalls
      ? "This tool call did not return a displayable result."
      : "This message contains no visible content.";

  return (
    <div className={`chat-message chat-message-${message.type}`}>
      <MessageAvatar type={message.type} />
      <div className="message-content">
        <div className="message-header">
          <span className="message-role">
            {isUser ? "You" : isSystem ? "System" : isError ? "Error" : "Claude"}
          </span>
          {message.cost !== undefined && (
            <span className="message-cost">${message.cost.toFixed(4)}</span>
          )}
        </div>
        <div className="message-body">
          {hasVisibleBlocks ? (
            visibleBlocks.map((block, i) => (
              <ContentBlockView key={i} block={block} toolResults={toolResults} />
            ))
          ) : (
            <div className="message-empty">
              <span className="message-empty-icon" />
              <div className="message-empty-text">
                <div className="message-empty-title">{emptyTitle}</div>
                <div className="message-empty-detail">{emptyDetail}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const toolResults = new Map<string, { content?: unknown; is_error?: boolean }>();
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === "tool_result") {
        const resultBlock = block as ToolResultContent;
        toolResults.set(resultBlock.tool_use_id, {
          content: resultBlock.content,
          is_error: resultBlock.is_error,
        });
      }
    }
  }

  const displayMessages = messages.filter((message) => {
    if (message.content.length === 0) return true;
    const toolResultOnly = message.content.every((block) => block.type === "tool_result");
    return !toolResultOnly;
  });

  return (
    <div className="message-list" ref={containerRef}>
      {displayMessages.length === 0 && !isLoading && (
        <div className="message-list-empty">
          <div className="empty-card">
            <span className="empty-icon" aria-hidden="true" />
            <p className="empty-title">Start a conversation</p>
            <p className="empty-hint">Type a message below or drop a task to get started.</p>
            <div className="empty-suggestions">
              <span className="empty-suggestion">Summarize this workspace</span>
              <span className="empty-suggestion">Review recent changes</span>
            </div>
          </div>
        </div>
      )}
      {displayMessages.map((msg) => (
        <Message key={msg.id} message={msg} toolResults={toolResults} />
      ))}
      {isLoading && (
        <div className="message-loading">
          <div className="message-avatar assistant">C</div>
          <div className="loading-content">
            <div className="loading-dot" />
            <span>Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
