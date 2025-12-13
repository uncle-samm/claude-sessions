import { useState } from "react";
import { ToolUseContent } from "../../store/messages";

interface ToolCallProps {
  tool: ToolUseContent;
  result?: unknown;
  isError?: boolean;
}

// Format file path for display
function formatPath(path: string): string {
  // Show just filename or last 2 path components
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return "..." + parts.slice(-2).join("/");
}

// Get language from file extension
function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    rs: "rust",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  };
  return langMap[ext || ""] || "plaintext";
}

// Count lines in content
function countLines(content: string): number {
  if (!content) return 0;
  return content.split("\n").length;
}

// Read tool display
function ReadTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const filePath = input.file_path as string || "";
  const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const lineCount = countLines(content);

  return (
    <div className="tool-read">
      <div className="tool-header-row">
        <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
          <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
          <span className="tool-icon file-icon" />
          <span className="tool-path-text">{formatPath(filePath)}</span>
          <span className="tool-line-count">({lineCount} lines)</span>
        </div>
        <button className="expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded && content && (
        <pre className={`tool-content lang-${getLanguage(filePath)}`}>
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}

// Render diff lines with line numbers
function DiffLines({ content, type, startLine = 1 }: { content: string; type: "removed" | "added"; startLine?: number }) {
  const lines = content.split("\n");
  const marker = type === "removed" ? "-" : "+";

  return (
    <div className={`diff-lines diff-${type}`}>
      {lines.map((line, i) => (
        <div key={i} className="diff-line">
          <span className="diff-line-number">{startLine + i}</span>
          <span className="diff-marker">{marker}</span>
          <span className="diff-line-content">{line || " "}</span>
        </div>
      ))}
    </div>
  );
}

// Edit tool display with diff
function EditTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const filePath = input.file_path as string || "";
  const oldString = input.old_string as string || "";
  const newString = input.new_string as string || "";

  return (
    <div className="tool-edit">
      <div className="tool-header-row">
        <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
          <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
          <span className="tool-icon edit-icon" />
          <span className="tool-path-text">{formatPath(filePath)}</span>
          {result !== undefined && <span className="tool-status-ok">✓</span>}
        </div>
      </div>
      {expanded && (
        <div className="tool-diff">
          {oldString && <DiffLines content={oldString} type="removed" />}
          {newString && <DiffLines content={newString} type="added" />}
        </div>
      )}
    </div>
  );
}

// Bash tool display
function BashTool({ input, result, isError }: { input: Record<string, unknown>; result?: unknown; isError?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const command = input.command as string || "";
  const description = input.description as string;
  const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);

  return (
    <div className={`tool-bash ${isError ? "has-error" : ""}`}>
      <div className="tool-bash-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">$</span>
        <span className="tool-command">{command.length > 60 ? command.slice(0, 60) + "..." : command}</span>
        {isError && <span className="tool-status-error">✗</span>}
      </div>
      {expanded && (
        <div className="tool-bash-content">
          {description && <div className="tool-description">{description}</div>}
          <pre className="tool-command-full"><code>{command}</code></pre>
          {output && (
            <div className="tool-output">
              <div className="tool-output-label">Output:</div>
              <pre><code>{output}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Write tool display
function WriteTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const filePath = input.file_path as string || "";
  const content = input.content as string || "";

  return (
    <div className="tool-write">
      <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">📝</span>
        <span className="tool-path-text">{formatPath(filePath)}</span>
        {result !== undefined && <span className="tool-status-ok">✓</span>}
        <span className="tool-size">({content.length} chars)</span>
      </div>
      {expanded && content && (
        <pre className={`tool-content lang-${getLanguage(filePath)}`}>
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}

// Glob tool display
function GlobTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const pattern = input.pattern as string || "";
  const files: string[] = Array.isArray(result) ? result.map((f) => String(f)) : [];

  return (
    <div className="tool-glob">
      <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">🔍</span>
        <span className="tool-path-text">{pattern}</span>
        <span className="tool-count">({files.length} files)</span>
      </div>
      {expanded && files.length > 0 && (
        <div className="tool-file-list">
          {files.map((f, i) => (
            <div key={i} className="tool-file-item">{f}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// Grep tool display
function GrepTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const pattern = input.pattern as string || "";
  const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);

  return (
    <div className="tool-grep">
      <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">🔎</span>
        <span className="tool-path-text">grep: {pattern}</span>
      </div>
      {expanded && content && (
        <pre className="tool-content">
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}

// Generic tool display for unknown tools
function GenericTool({ tool, result, isError }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`tool-generic ${isError ? "has-error" : ""}`}>
      <div className="tool-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-name">{tool.name}</span>
        {isError && <span className="tool-status-error">✗</span>}
      </div>
      {expanded && (
        <div className="tool-body">
          <div className="tool-section">
            <div className="tool-section-label">Input:</div>
            <pre><code>{JSON.stringify(tool.input, null, 2)}</code></pre>
          </div>
          {result !== undefined && (
            <div className="tool-section">
              <div className="tool-section-label">Result:</div>
              <pre><code>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCall({ tool, result, isError }: ToolCallProps) {
  // Route to specific tool display based on name
  switch (tool.name) {
    case "Read":
      return <ReadTool input={tool.input} result={result} />;
    case "Edit":
      return <EditTool input={tool.input} result={result} />;
    case "Bash":
      return <BashTool input={tool.input} result={result} isError={isError} />;
    case "Write":
      return <WriteTool input={tool.input} result={result} />;
    case "Glob":
      return <GlobTool input={tool.input} result={result} />;
    case "Grep":
      return <GrepTool input={tool.input} result={result} />;
    default:
      return <GenericTool tool={tool} result={result} isError={isError} />;
  }
}
