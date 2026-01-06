import { useEffect, useRef } from "react";
import { ChatMessage, ContentBlock, ToolUseContent, ToolResultContent, ThinkingContent } from "../../store/messages";
import { ToolCall } from "./ToolCall";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownContent } from "./MarkdownContent";

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

function isHiddenToolName(name: string): boolean {
  // Show our custom claude-sessions MCP tools
  if (name.startsWith("mcp__claude-sessions__")) {
    return false;
  }
  // Hide other MCP tools (internal signaling)
  return name.startsWith("mcp__");
}

function isHiddenToolBlock(block: ContentBlock): boolean {
  if (block.type !== "tool_use") return false;
  return isHiddenToolName((block as ToolUseContent).name);
}

// Render a single content block
function ContentBlockView({ block, toolResults }: { block: ContentBlock; toolResults: Map<string, { content?: unknown; is_error?: boolean }> }) {
  if (block.type === "text") {
    const textBlock = block as { type: "text"; text: string };
    return <MarkdownContent content={textBlock.text} className="message-markdown" />;
  }

  if (block.type === "thinking") {
    const thinkingBlock = block as ThinkingContent;
    return <ThinkingBlock thinking={thinkingBlock.thinking} />;
  }

  if (block.type === "tool_use") {
    const toolBlock = block as ToolUseContent;
    const result = toolResults.get(toolBlock.id);
    // Use different wrapper for our inline claude-sessions tools vs regular tool cards
    const isInlineTool = toolBlock.name.startsWith("mcp__claude-sessions__");
    const wrapperClass = isInlineTool ? "message-tool-inline" : "message-tool";
    return (
      <div className={wrapperClass}>
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

function Message({ message, toolResults }: { message: ChatMessage; toolResults: Map<string, { content?: unknown; is_error?: boolean }> }) {
  const showMeta = message.cost !== undefined;

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
    <div className={`chat-message chat-message-${message.type}`} data-testid={`${message.type}-message`}>
      <div className="message-content">
        {showMeta && (
          <div className="message-meta">
            <span className="message-cost">${(message.cost ?? 0).toFixed(4)}</span>
          </div>
        )}
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
    <div className="message-list" ref={containerRef} data-testid="message-list">
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
        <div className="message-loading chat-message chat-message-assistant">
          <div className="message-content">
            <div className="message-body message-body-loading">
              <div className="loading-dot" />
              <span>Processing...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
