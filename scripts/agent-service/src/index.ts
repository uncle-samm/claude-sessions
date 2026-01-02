#!/usr/bin/env node
/**
 * Agent Service - Claude Agent SDK wrapper for Tauri sidecar
 *
 * Protocol:
 * - Input: JSON object as first CLI argument
 * - Output: Newline-delimited JSON messages to stdout
 * - Errors: JSON error objects to stderr
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "fs";

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
  sessionId?: string;
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

// Main agent loop
async function runAgent(input: AgentInput): Promise<void> {
  try {
    // Change to working directory
    process.chdir(input.cwd);

    // IMPORTANT: Always resolve Claude CLI path before calling SDK.
    // This avoids the SDK's import.meta.url fallback which breaks in pkg binaries.
    const claudeCodePath = input.claudeCodePath || findClaudeCliPath();

    // Build SDK options
    const options: Parameters<typeof query>[0]["options"] = {
      allowedTools: input.options?.allowedTools,
      permissionMode: input.options?.permissionMode,
      mcpServers: input.options?.mcpServers,
      systemPrompt: input.options?.systemPrompt,
      // Always provide path to avoid import.meta.url issues in pkg binaries
      pathToClaudeCodeExecutable: claudeCodePath,
    };

    // Handle session resume
    if (input.action === "resume" && input.sessionId) {
      options.resume = input.sessionId;
    }

    // Run the agent query
    for await (const message of query({
      prompt: input.prompt,
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
