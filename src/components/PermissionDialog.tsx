import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./PermissionDialog.css";

interface PermissionRequest {
  request_id: string;
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  description?: string;
}

// Tool display configuration
const TOOL_CONFIG: Record<string, { verb: string; icon: string }> = {
  Bash: { verb: "Run", icon: "terminal" },
  Write: { verb: "Write to", icon: "file" },
  Edit: { verb: "Edit", icon: "edit" },
  Read: { verb: "Read", icon: "eye" },
  Glob: { verb: "Search", icon: "search" },
  Grep: { verb: "Search in", icon: "search" },
  WebFetch: { verb: "Fetch", icon: "globe" },
  Task: { verb: "Launch", icon: "rocket" },
  NotebookEdit: { verb: "Edit notebook", icon: "notebook" },
};

function getToolDisplay(toolName: string): { verb: string; icon: string } {
  // Handle MCP tools (mcp__server__tool)
  if (toolName.startsWith("mcp__")) {
    return { verb: "Use", icon: "plug" };
  }
  return TOOL_CONFIG[toolName] || { verb: "Use", icon: "tool" };
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  // Format the input for display based on tool type
  if (toolName === "Bash" && input.command) {
    return String(input.command);
  }
  if ((toolName === "Write" || toolName === "Edit" || toolName === "Read") && input.file_path) {
    return String(input.file_path);
  }
  if (toolName === "Glob" && input.pattern) {
    return String(input.pattern);
  }
  if (toolName === "Grep" && input.pattern) {
    return `${input.pattern}${input.path ? ` in ${input.path}` : ""}`;
  }
  if (toolName === "WebFetch" && input.url) {
    return String(input.url);
  }
  if (toolName === "Task" && input.prompt) {
    const prompt = String(input.prompt);
    return prompt.length > 100 ? prompt.substring(0, 100) + "..." : prompt;
  }
  // Default: show JSON
  return JSON.stringify(input, null, 2);
}

function getDescription(toolName: string, _input: Record<string, unknown>): string {
  if (toolName === "Bash") {
    return "Execute a shell command";
  }
  if (toolName === "Write") {
    return "Create or overwrite a file";
  }
  if (toolName === "Edit") {
    return "Modify an existing file";
  }
  if (toolName === "Read") {
    return "Read file contents";
  }
  if (toolName === "Glob") {
    return "Find files matching a pattern";
  }
  if (toolName === "Grep") {
    return "Search for text in files";
  }
  if (toolName === "WebFetch") {
    return "Fetch content from a URL";
  }
  if (toolName === "Task") {
    return "Launch a sub-agent to handle a task";
  }
  return `Execute the ${toolName} tool`;
}

export function PermissionDialog() {
  const [request, setRequest] = useState<PermissionRequest | null>(null);
  const [isResponding, setIsResponding] = useState(false);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      if (!request || isResponding) return;

      if (e.key === "Escape") {
        e.preventDefault();
        await respond("deny");
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        await respond("allow", true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        await respond("allow", false);
      }
    },
    [request, isResponding]
  );

  // Listen for permission requests from Tauri
  useEffect(() => {
    const unlisten = listen<PermissionRequest>("permission-request", (event) => {
      console.log("[PermissionDialog] Received request:", event.payload);
      setRequest(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Add keyboard listener
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const respond = async (behavior: "allow" | "deny", alwaysAllow?: boolean) => {
    if (!request || isResponding) return;

    setIsResponding(true);
    try {
      await invoke("respond_to_permission", {
        requestId: request.request_id,
        behavior,
        message: behavior === "deny" ? "User denied permission" : null,
        alwaysAllow: alwaysAllow || null,
      });
    } catch (error) {
      console.error("[PermissionDialog] Failed to respond:", error);
    } finally {
      // Always clear the dialog, even on error
      setRequest(null);
      setIsResponding(false);
    }
  };

  if (!request) return null;

  const { verb } = getToolDisplay(request.tool_name);
  const formattedInput = formatToolInput(request.tool_name, request.tool_input);
  const description = request.description || getDescription(request.tool_name, request.tool_input);

  return (
    <div className="permission-overlay">
      <div className="permission-dialog">
        <div className="permission-header">
          <span className="permission-title">
            Allow Claude to <strong>{verb}</strong>?
          </span>
        </div>

        <div className="permission-description">{description}</div>

        <div className="permission-preview">
          <pre>{formattedInput}</pre>
        </div>

        <div className="permission-actions">
          <button
            className="permission-btn permission-btn-deny"
            onClick={() => respond("deny")}
            disabled={isResponding}
          >
            Deny
            <span className="permission-shortcut">Esc</span>
          </button>

          <button
            className="permission-btn permission-btn-always"
            onClick={() => respond("allow", true)}
            disabled={isResponding}
          >
            Always allow for project
            <span className="permission-shortcut">⌘↵</span>
          </button>

          <button
            className="permission-btn permission-btn-allow"
            onClick={() => respond("allow", false)}
            disabled={isResponding}
          >
            Allow once
            <span className="permission-shortcut">↵</span>
          </button>
        </div>
      </div>
    </div>
  );
}
