import { useState } from "react";
import { ToolUseContent } from "../../store/messages";

interface ToolCallProps {
  tool: ToolUseContent;
  result?: unknown;
  isError?: boolean;
}

// Checkmark icon component
function CheckIcon() {
  return (
    <svg className="tool-result-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Tool result header component
function ToolResultHeader({ label, hasResult }: { label: string; hasResult: boolean }) {
  return (
    <div className="tool-result-header">
      {hasResult && <CheckIcon />}
      <span className="tool-result-label">{label}</span>
    </div>
  );
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
  const hasResult = result !== undefined;

  return (
    <div className="tool-read">
      <ToolResultHeader label="Read Result" hasResult={hasResult} />
      <div className="tool-header-row">
        <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
          <span className="tool-icon file-icon" />
          <span className="tool-path-text">{filePath}</span>
          <span className="tool-line-count">({lineCount} lines)</span>
        </div>
        <button className="expand-btn" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? "Collapse" : "> Expand"}
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
  const hasResult = result !== undefined;

  return (
    <div className="tool-edit">
      <ToolResultHeader label="Edit Result" hasResult={hasResult} />
      <div className="tool-header-row">
        <div className="tool-file-path" onClick={() => setExpanded(!expanded)}>
          <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
          <span className="tool-icon file-icon" />
          <span className="tool-path-text">{filePath}</span>
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
  const hasResult = result !== undefined;

  return (
    <div className={`tool-bash ${isError ? "has-error" : ""}`}>
      <ToolResultHeader label={isError ? "Bash Error" : "Bash Result"} hasResult={hasResult && !isError} />
      <div className="tool-bash-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon bash-icon">$</span>
        <span className="tool-command">{command.length > 60 ? command.slice(0, 60) + "..." : command}</span>
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

// Task tool display (sub-agent spawning)
function TaskTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const description = input.description as string || "Task";
  const prompt = input.prompt as string || "";
  const subagentType = input.subagent_type as string;
  const hasResult = result !== undefined;

  return (
    <div className="tool-task">
      <ToolResultHeader label="Task" hasResult={hasResult} />
      <div className="tool-header-row" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">🤖</span>
        <span className="tool-task-description">{description}</span>
        {subagentType && <span className="tool-badge">{subagentType}</span>}
      </div>
      {expanded && (
        <div className="tool-task-content">
          {prompt && (
            <div className="tool-task-prompt">
              <pre>{prompt.length > 500 ? prompt.slice(0, 500) + "..." : prompt}</pre>
            </div>
          )}
          {hasResult && (
            <div className="tool-output">
              <div className="tool-output-label">Result:</div>
              <pre><code>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// TaskOutput tool display
function TaskOutputTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const taskId = input.task_id as string || "";
  const hasResult = result !== undefined;

  return (
    <div className="tool-task-output">
      <ToolResultHeader label="Task Output" hasResult={hasResult} />
      <div className="tool-header-row">
        <span className="tool-icon">📋</span>
        <span className="tool-task-id">Task: {taskId.slice(0, 8)}...</span>
      </div>
      {hasResult && (
        <div className="tool-output">
          <pre><code>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</code></pre>
        </div>
      )}
    </div>
  );
}

// WebFetch tool display
function WebFetchTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const url = input.url as string || "";
  const prompt = input.prompt as string || "";
  const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const hasResult = result !== undefined;

  // Extract domain from URL
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = url;
  }

  return (
    <div className="tool-webfetch">
      <ToolResultHeader label="Web Fetch" hasResult={hasResult} />
      <div className="tool-header-row" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">🌐</span>
        <span className="tool-url">{domain}</span>
      </div>
      {expanded && (
        <div className="tool-webfetch-content">
          <div className="tool-url-full">{url}</div>
          {prompt && <div className="tool-prompt">Prompt: {prompt}</div>}
          {content && (
            <div className="tool-output">
              <pre><code>{content.length > 1000 ? content.slice(0, 1000) + "..." : content}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// WebSearch tool display
function WebSearchTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const query = input.query as string || "";
  const content = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const hasResult = result !== undefined;

  return (
    <div className="tool-websearch">
      <ToolResultHeader label="Web Search" hasResult={hasResult} />
      <div className="tool-header-row" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">🔍</span>
        <span className="tool-search-query">"{query}"</span>
      </div>
      {expanded && content && (
        <div className="tool-output">
          <pre><code>{content.length > 1000 ? content.slice(0, 1000) + "..." : content}</code></pre>
        </div>
      )}
    </div>
  );
}

// NotebookEdit tool display
function NotebookEditTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const notebookPath = input.notebook_path as string || "";
  const cellType = input.cell_type as string || "code";
  const editMode = input.edit_mode as string || "replace";
  const newSource = input.new_source as string || "";
  const hasResult = result !== undefined;

  return (
    <div className="tool-notebook">
      <ToolResultHeader label="Notebook Edit" hasResult={hasResult} />
      <div className="tool-header-row" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">📓</span>
        <span className="tool-path-text">{formatPath(notebookPath)}</span>
        <span className="tool-badge">{editMode}</span>
        <span className="tool-badge">{cellType}</span>
      </div>
      {expanded && newSource && (
        <pre className="tool-content lang-python">
          <code>{newSource}</code>
        </pre>
      )}
    </div>
  );
}

// AskUserQuestion tool display
function AskUserQuestionTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const question = input.question as string || "";
  const hasResult = result !== undefined;

  return (
    <div className="tool-ask-user">
      <ToolResultHeader label="Question" hasResult={hasResult} />
      <div className="tool-ask-content">
        <span className="tool-icon">❓</span>
        <span className="tool-question">{question}</span>
      </div>
      {hasResult && (
        <div className="tool-answer">
          <span className="tool-icon">💬</span>
          <span>{typeof result === "string" ? result : JSON.stringify(result)}</span>
        </div>
      )}
    </div>
  );
}

// EnterPlanMode tool display
function EnterPlanModeTool({ result }: { result?: unknown }) {
  const hasResult = result !== undefined;

  return (
    <div className="tool-plan-mode">
      <ToolResultHeader label="Enter Plan Mode" hasResult={hasResult} />
      <div className="tool-plan-header">
        <span className="tool-icon">📝</span>
        <span>Entering planning mode...</span>
      </div>
    </div>
  );
}

// ExitPlanMode tool display with markdown plan
function ExitPlanModeTool({ result }: { result?: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const planContent = typeof result === "string" ? result : "";
  const hasResult = result !== undefined;

  return (
    <div className="tool-plan-mode tool-exit-plan">
      <ToolResultHeader label="Plan Complete" hasResult={hasResult} />
      <div className="tool-plan-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="tool-icon">✅</span>
        <span>Plan ready for implementation</span>
      </div>
      {expanded && planContent && (
        <div className="tool-plan-content">
          <pre className="tool-content lang-markdown">
            <code>{planContent}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

// KillShell tool display
function KillShellTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const shellId = input.shell_id as string || "";
  const hasResult = result !== undefined;

  return (
    <div className="tool-kill-shell">
      <ToolResultHeader label="Kill Shell" hasResult={hasResult} />
      <div className="tool-header-row">
        <span className="tool-icon">🛑</span>
        <span>Terminated shell: {shellId.slice(0, 8)}...</span>
      </div>
    </div>
  );
}

// Skill tool display
function SkillTool({ input, result }: { input: Record<string, unknown>; result?: unknown }) {
  const skill = input.skill as string || "";
  const hasResult = result !== undefined;

  return (
    <div className="tool-skill">
      <ToolResultHeader label="Skill" hasResult={hasResult} />
      <div className="tool-header-row">
        <span className="tool-icon">⚡</span>
        <span className="tool-skill-name">{skill}</span>
      </div>
      {hasResult && (
        <div className="tool-output">
          <pre><code>{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</code></pre>
        </div>
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
  // Hide MCP tool calls completely (internal signaling)
  if (tool.name.startsWith("mcp__")) {
    return null;
  }

  // Hide TodoWrite tool calls (shown in dedicated panel)
  if (tool.name === "TodoWrite") {
    return null;
  }

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
    case "Task":
      return <TaskTool input={tool.input} result={result} />;
    case "TaskOutput":
      return <TaskOutputTool input={tool.input} result={result} />;
    case "WebFetch":
      return <WebFetchTool input={tool.input} result={result} />;
    case "WebSearch":
      return <WebSearchTool input={tool.input} result={result} />;
    case "NotebookEdit":
      return <NotebookEditTool input={tool.input} result={result} />;
    case "AskUserQuestion":
      return <AskUserQuestionTool input={tool.input} result={result} />;
    case "EnterPlanMode":
      return <EnterPlanModeTool result={result} />;
    case "ExitPlanMode":
      return <ExitPlanModeTool result={result} />;
    case "KillShell":
      return <KillShellTool input={tool.input} result={result} />;
    case "Skill":
      return <SkillTool input={tool.input} result={result} />;
    default:
      return <GenericTool tool={tool} result={result} isError={isError} />;
  }
}
