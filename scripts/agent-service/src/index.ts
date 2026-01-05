#!/usr/bin/env node
/**
 * Agent Service - Claude Agent SDK wrapper for Tauri sidecar
 *
 * Protocol:
 * - Input: JSON object as first CLI argument
 * - Output: Newline-delimited JSON messages to stdout
 * - Errors: JSON error objects to stderr
 */

import {
  query,
  tool,
  createSdkMcpServer,
  type CanUseTool,
  type PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "fs";
import { z } from "zod";
import { randomUUID } from "crypto";

/**
 * Find the Claude CLI executable path.
 * Checks common installation locations across platforms.
 * Must be called before SDK query() to avoid import.meta.url issues in pkg binaries.
 */
function findClaudeCliPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";

  const candidates: string[] = [
    // macOS Homebrew (ARM)
    "/opt/homebrew/bin/claude",
    // macOS Homebrew (Intel) / Linux
    "/usr/local/bin/claude",
    // User-local install
    `${home}/.claude/bin/claude`,
    // npm global install
    `${home}/.npm-global/bin/claude`,
  ];

  // Windows-specific paths
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const appData = process.env.APPDATA || "";
    candidates.push(
      `${localAppData}\\Programs\\claude\\claude.exe`,
      `${appData}\\npm\\claude.cmd`,
      `${home}\\AppData\\Local\\Programs\\claude\\claude.exe`,
    );
  }

  for (const path of candidates) {
    if (path && existsSync(path)) {
      return path;
    }
  }

  // Fallback to PATH lookup (will work if claude is in PATH)
  return "claude";
}

// Types for input/output protocol
interface AgentInput {
  action: "query" | "resume";
  prompt: string;
  sessionId?: string; // SDK session ID for resume
  claudeSessionsId?: string; // Our session ID for custom tools
  cwd: string;
  claudeCodePath?: string; // Path to Claude Code CLI executable
  options?: {
    allowedTools?: string[];
    permissionMode?: "default" | "acceptEdits" | "bypassPermissions";
    mcpServers?: Record<
      string,
      {
        command: string;
        args?: string[];
        env?: Record<string, string>;
      }
    >;
    systemPrompt?: string;
  };
}

// Server URL for the Tauri HTTP API
const SESSION_SERVER_URL =
  process.env.CLAUDE_SESSIONS_SERVER || "http://127.0.0.1:19420";

/**
 * Create SDK custom tools for claude-sessions integration.
 * These tools allow Claude to interact with the session management system.
 */
function createSessionTools(sessionId: string) {
  return createSdkMcpServer({
    name: "claude-sessions",
    version: "1.0.0",
    tools: [
      tool(
        "notify_ready",
        "IMPORTANT: You MUST call this tool when you complete ANY task or respond to the user. Include a brief summary of what was accomplished. This signals that you are done working and ready for the next user message.",
        {
          message: z
            .string()
            .describe(
              "A brief summary of what was accomplished (1-2 sentences). Always include this to let the user know what you did.",
            ),
        },
        async (args) => {
          try {
            const response = await fetch(
              `${SESSION_SERVER_URL}/api/session/${sessionId}/message`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: args.message }),
              },
            );
            const data = (await response.json()) as {
              success: boolean;
              error?: string;
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: data.success
                    ? `Message sent: ${args.message}`
                    : `Error: ${data.error || "Unknown error"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `HTTP Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
              ],
            };
          }
        },
      ),

      tool(
        "notify_busy",
        "Signal that Claude is busy working. Call this when starting a long-running task.",
        {},
        async () => {
          try {
            const response = await fetch(
              `${SESSION_SERVER_URL}/api/session/${sessionId}/status`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "busy" }),
              },
            );
            const data = (await response.json()) as {
              success: boolean;
              error?: string;
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: data.success
                    ? "Session status updated to: busy"
                    : `Error: ${data.error || "Unknown error"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `HTTP Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
              ],
            };
          }
        },
      ),

      tool(
        "get_pending_comments",
        "Get all open/unresolved comments on your code changes that need attention. Use this to check if the user has left feedback on your work.",
        {},
        async () => {
          try {
            const response = await fetch(
              `${SESSION_SERVER_URL}/api/session/${sessionId}/comments`,
            );
            const data = (await response.json()) as {
              success: boolean;
              comments?: Array<{
                id: string;
                file_path: string;
                line_number?: number;
                author: string;
                content: string;
              }>;
              error?: string;
            };

            if (data.success && data.comments) {
              if (data.comments.length === 0) {
                return {
                  content: [
                    {
                      type: "text" as const,
                      text: "No pending comments on your changes.",
                    },
                  ],
                };
              }
              const commentText =
                `Found ${data.comments.length} pending comment(s):\n\n` +
                data.comments
                  .map(
                    (c, i) =>
                      `${i + 1}. [${c.id}] ${c.file_path}:${c.line_number || "file"}\n   Author: ${c.author}\n   "${c.content}"`,
                  )
                  .join("\n\n");
              return {
                content: [{ type: "text" as const, text: commentText }],
              };
            }
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: ${data.error || "Failed to get comments"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `HTTP Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
              ],
            };
          }
        },
      ),

      tool(
        "reply_to_comment",
        "Reply to a specific comment thread. Use this to respond to user feedback on your code changes.",
        {
          comment_id: z.string().describe("The ID of the comment to reply to"),
          message: z.string().describe("Your response to the comment"),
        },
        async (args) => {
          try {
            const response = await fetch(
              `${SESSION_SERVER_URL}/api/session/${sessionId}/comments/${args.comment_id}/reply`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: args.message }),
              },
            );
            const data = (await response.json()) as {
              success: boolean;
              error?: string;
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: data.success
                    ? `Reply added to comment ${args.comment_id}`
                    : `Error: ${data.error || "Failed to reply"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `HTTP Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
              ],
            };
          }
        },
      ),

      tool(
        "resolve_comment",
        "Mark a comment as resolved after addressing it. Use this after you have addressed the feedback in a comment.",
        {
          comment_id: z
            .string()
            .describe("The ID of the comment to resolve"),
          resolution_note: z
            .string()
            .optional()
            .describe("Optional note explaining how the comment was addressed"),
        },
        async (args) => {
          try {
            const response = await fetch(
              `${SESSION_SERVER_URL}/api/session/${sessionId}/comments/${args.comment_id}/resolve`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  resolution_note: args.resolution_note,
                }),
              },
            );
            const data = (await response.json()) as {
              success: boolean;
              error?: string;
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: data.success
                    ? `Comment ${args.comment_id} marked as resolved`
                    : `Error: ${data.error || "Failed to resolve"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `HTTP Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
              ],
            };
          }
        },
      ),

      tool(
        "request_review",
        "Request user review of your changes with a message. Use this when you want the user to review your code changes.",
        {
          message: z
            .string()
            .describe("Message to the user explaining what to review"),
        },
        async (args) => {
          try {
            const response = await fetch(
              `${SESSION_SERVER_URL}/api/session/${sessionId}/message`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  message: `[Review Request] ${args.message}`,
                }),
              },
            );
            const data = (await response.json()) as {
              success: boolean;
              error?: string;
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: data.success
                    ? "Review request sent to user"
                    : `Error: ${data.error || "Failed to send review request"}`,
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `HTTP Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                },
              ],
            };
          }
        },
      ),
    ],
  });
}

interface OutputMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: unknown;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
}

// Write JSON message to stdout
function emit(message: OutputMessage): void {
  console.log(JSON.stringify(message));
}

// Write error to stderr
function emitError(error: string, details?: unknown): void {
  console.error(
    JSON.stringify({
      type: "error",
      error,
      details,
      timestamp: new Date().toISOString(),
    }),
  );
}

// Graceful shutdown handler
function setupShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    emit({ type: "system", subtype: "shutdown", signal });
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Parse and validate input
function parseInput(): AgentInput {
  const rawInput = process.argv[2];

  if (!rawInput) {
    throw new Error("No input provided. Expected JSON as first argument.");
  }

  try {
    const input = JSON.parse(rawInput) as AgentInput;

    if (!input.action) {
      throw new Error("Missing required field: action");
    }
    if (!input.prompt && input.action === "query") {
      throw new Error("Missing required field: prompt");
    }
    if (!input.cwd) {
      throw new Error("Missing required field: cwd");
    }

    return input;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON input: ${err.message}`);
    }
    throw err;
  }
}

// MCP tool names that should be auto-allowed for our custom tools
const CLAUDE_SESSIONS_TOOLS = [
  "mcp__claude-sessions__notify_ready",
  "mcp__claude-sessions__notify_busy",
  "mcp__claude-sessions__get_pending_comments",
  "mcp__claude-sessions__reply_to_comment",
  "mcp__claude-sessions__resolve_comment",
  "mcp__claude-sessions__request_review",
];

// Tools that are always safe to run without permission prompts
const SAFE_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "TodoWrite",
  "WebSearch",
  "Task", // Sub-agent tasks
  ...CLAUDE_SESSIONS_TOOLS,
]);

// Permission request/response types
interface PermissionRequestPayload {
  request_id: string;
  session_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  description?: string;
}

interface PermissionResponsePayload {
  request_id: string;
  behavior: "allow" | "deny";
  message?: string;
  interrupt?: boolean;
  always_allow?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Create a canUseTool callback that requests permission from the Tauri UI.
 */
function createCanUseTool(sessionId: string): CanUseTool {
  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal;
      suggestions?: unknown[];
      toolUseID: string;
    },
  ): Promise<PermissionResult> => {
    // Auto-allow safe tools
    if (SAFE_TOOLS.has(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }

    // For other tools, request permission from the UI
    const requestId = randomUUID();
    const request: PermissionRequestPayload = {
      request_id: requestId,
      session_id: sessionId,
      tool_name: toolName,
      tool_input: input,
      tool_use_id: options.toolUseID,
    };

    // Emit permission request event for logging
    emit({
      type: "permission",
      subtype: "request",
      tool_name: toolName,
      request_id: requestId,
    });

    try {
      // Send permission request to Tauri backend
      const response = await fetch(
        `${SESSION_SERVER_URL}/api/session/${sessionId}/permission-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: options.signal,
        },
      );

      if (!response.ok) {
        // If the server returns an error, deny with message
        const errorText = await response.text();
        emit({
          type: "permission",
          subtype: "error",
          tool_name: toolName,
          request_id: requestId,
          error: errorText,
        });
        return {
          behavior: "deny",
          message: `Permission request failed: ${response.status} ${errorText}`,
        };
      }

      const result = (await response.json()) as ApiResponse<PermissionResponsePayload>;

      if (!result.success || !result.data) {
        emit({
          type: "permission",
          subtype: "error",
          tool_name: toolName,
          request_id: requestId,
          error: result.error,
        });
        return {
          behavior: "deny",
          message: result.error || "Permission denied by server",
        };
      }

      const permResponse = result.data;

      emit({
        type: "permission",
        subtype: "response",
        tool_name: toolName,
        request_id: requestId,
        behavior: permResponse.behavior,
        always_allow: permResponse.always_allow,
      });

      if (permResponse.behavior === "allow") {
        return {
          behavior: "allow",
          updatedInput: input,
        };
      } else {
        return {
          behavior: "deny",
          message: permResponse.message || "User denied permission",
          interrupt: permResponse.interrupt,
        };
      }
    } catch (error) {
      // Handle fetch errors (network, abort, etc.)
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      emit({
        type: "permission",
        subtype: "error",
        tool_name: toolName,
        request_id: requestId,
        error: errorMessage,
      });

      // If aborted, return deny with interrupt
      if (error instanceof Error && error.name === "AbortError") {
        return {
          behavior: "deny",
          message: "Permission request was cancelled",
          interrupt: true,
        };
      }

      // For other errors, deny but don't interrupt
      return {
        behavior: "deny",
        message: `Permission request error: ${errorMessage}`,
      };
    }
  };
}

// Main agent loop
async function runAgent(input: AgentInput): Promise<void> {
  try {
    // Change to working directory
    process.chdir(input.cwd);

    // IMPORTANT: Always resolve Claude CLI path before calling SDK.
    // This avoids the SDK's import.meta.url fallback which breaks in pkg binaries.
    const claudeCodePath = input.claudeCodePath || findClaudeCliPath();

    // Check if we have a claude-sessions ID to enable custom tools
    const claudeSessionsId = input.claudeSessionsId;

    // Build MCP servers config - include our custom tools if we have a session ID
    const mcpServers: Parameters<typeof query>[0]["options"]["mcpServers"] =
      claudeSessionsId
        ? {
            ...input.options?.mcpServers,
            "claude-sessions": createSessionTools(claudeSessionsId),
          }
        : input.options?.mcpServers;

    // Build allowed tools - include our custom tools if we have a session ID
    const allowedTools = claudeSessionsId
      ? [...(input.options?.allowedTools || []), ...CLAUDE_SESSIONS_TOOLS]
      : input.options?.allowedTools;

    // Build SDK options
    const options: Parameters<typeof query>[0]["options"] = {
      allowedTools,
      permissionMode: input.options?.permissionMode,
      mcpServers,
      // Use the standard Claude Code system prompt preset
      // This ensures we get the full Claude Code behavior and capabilities
      systemPrompt: input.options?.systemPrompt || {
        type: "preset" as const,
        preset: "claude_code" as const,
      },
      // Always provide path to avoid import.meta.url issues in pkg binaries
      pathToClaudeCodeExecutable: claudeCodePath,
      // Add permission callback only in 'default' mode (or when mode is undefined)
      // In acceptEdits/bypassPermissions modes, user wants auto-approval so skip dialog
      canUseTool:
        claudeSessionsId &&
        (!input.options?.permissionMode ||
          input.options.permissionMode === "default")
          ? createCanUseTool(claudeSessionsId)
          : undefined,
    };

    // Handle session resume
    if (input.action === "resume" && input.sessionId) {
      options.resume = input.sessionId;
    }

    // When using MCP servers with custom tools, we need streaming input mode
    // Create an async generator for the prompt
    async function* generateMessages() {
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: input.prompt,
        },
      };
    }

    // Use streaming input if we have MCP servers (required for custom tools)
    const promptInput = mcpServers ? generateMessages() : input.prompt;

    // Run the agent query
    for await (const message of query({
      prompt: promptInput,
      options,
    })) {
      // Forward all messages to stdout as JSON
      emit(message as OutputMessage);
    }

    // Signal completion
    emit({ type: "system", subtype: "complete" });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    emitError(error.message, {
      name: error.name,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Entry point
async function main(): Promise<void> {
  setupShutdownHandlers();

  try {
    const input = parseInput();

    // Emit init message
    emit({
      type: "system",
      subtype: "init",
      cwd: input.cwd,
      action: input.action,
      timestamp: new Date().toISOString(),
    });

    await runAgent(input);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    emitError(error.message);
    process.exit(1);
  }
}

main();
