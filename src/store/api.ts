/**
 * Tauri IPC API for database operations
 */

import { invoke } from "@tauri-apps/api/core";

// Types matching Rust backend
export interface WorkspaceData {
  id: string;
  name: string;
  folder: string;
  script_path: string | null;
  origin_branch: string;
}

export interface SessionData {
  id: string;
  name: string;
  cwd: string;
  workspace_id: string | null;
  worktree_name: string | null;
  status: string; // "ready" or "busy"
  base_commit: string | null; // Git commit SHA to diff against (stable reference)
}

// Workspace API
export async function getWorkspaces(): Promise<WorkspaceData[]> {
  return invoke<WorkspaceData[]>("get_workspaces");
}

export async function createWorkspace(
  name: string,
  folder: string,
  scriptPath: string | null,
  originBranch: string | null = null
): Promise<WorkspaceData> {
  return invoke<WorkspaceData>("create_workspace", {
    name,
    folder,
    scriptPath,
    originBranch,
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  return invoke<void>("delete_workspace", { id });
}

// Session API
export async function getSessions(): Promise<SessionData[]> {
  return invoke<SessionData[]>("get_sessions");
}

export async function createSession(
  name: string,
  cwd: string,
  workspaceId: string | null,
  worktreeName: string | null,
  baseCommit: string | null = null
): Promise<SessionData> {
  return invoke<SessionData>("create_session", {
    name,
    cwd,
    workspaceId,
    worktreeName,
    baseCommit,
  });
}

export async function deleteSession(id: string): Promise<void> {
  return invoke<void>("delete_session", { id });
}

export async function renameSession(id: string, name: string): Promise<void> {
  return invoke<void>("rename_session", { id, name });
}

export async function updateSessionCwd(id: string, cwd: string): Promise<void> {
  return invoke<void>("update_session_cwd", { id, cwd });
}

export async function getSessionStatus(id: string): Promise<string> {
  return invoke<string>("get_session_status", { id });
}

export async function setSessionStatus(id: string, status: string): Promise<void> {
  return invoke<void>("set_session_status", { id, status });
}

// Configure a worktree with MCP settings for Claude Code
export async function configureWorktree(worktreePath: string, sessionId: string): Promise<void> {
  return invoke<void>("configure_worktree", { worktreePath, sessionId });
}

// Inbox Message API
export interface InboxMessageData {
  id: string;
  session_id: string;
  session_name: string;
  message: string;
  created_at: string;
  read_at: string | null;
  first_read_at: string | null;  // Set once when first read, never cleared
}

export async function getInboxMessages(): Promise<InboxMessageData[]> {
  return invoke<InboxMessageData[]>("get_inbox_messages");
}

export async function markInboxMessageRead(id: string): Promise<void> {
  return invoke<void>("mark_inbox_message_read", { id });
}

export async function markInboxMessageUnread(id: string): Promise<void> {
  return invoke<void>("mark_inbox_message_unread", { id });
}

export async function markSessionMessagesRead(sessionId: string): Promise<number> {
  return invoke<number>("mark_session_messages_read", { sessionId });
}

export async function deleteInboxMessage(id: string): Promise<void> {
  return invoke<void>("delete_inbox_message", { id });
}

export async function clearInbox(): Promise<void> {
  return invoke<void>("clear_inbox");
}

// Git Diff API
export interface DiffLine {
  line_type: "context" | "add" | "delete";
  old_line: number | null;
  new_line: number | null;
  content: string;
}

export interface DiffHunk {
  old_start: number;
  old_count: number;
  new_start: number;
  new_count: number;
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  old_path: string | null;
  status: "added" | "modified" | "deleted" | "renamed";
  insertions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffSummary {
  files: FileDiff[];
  total_insertions: number;
  total_deletions: number;
  total_files: number;
}

export async function getDiffSummary(worktreePath: string, baseBranch: string): Promise<DiffSummary> {
  return invoke<DiffSummary>("get_diff_summary", { worktreePath, baseBranch });
}

export async function getFileDiff(worktreePath: string, filePath: string, baseBranch: string): Promise<FileDiff> {
  return invoke<FileDiff>("get_file_diff", { worktreePath, filePath, baseBranch });
}

export async function getCurrentBranch(worktreePath: string): Promise<string> {
  return invoke<string>("get_current_branch", { worktreePath });
}

export async function getCommitSha(worktreePath: string, refName: string): Promise<string> {
  return invoke<string>("get_commit_sha", { worktreePath, refName });
}

export async function updateSessionBaseCommit(id: string, baseCommit: string): Promise<void> {
  return invoke<void>("update_session_base_commit", { id, baseCommit });
}

export async function fetchOrigin(worktreePath: string): Promise<void> {
  return invoke<void>("fetch_origin", { worktreePath });
}

// Comment API
export interface DiffCommentData {
  id: string;
  session_id: string;
  file_path: string;
  line_number: number | null;
  line_type: string | null;
  author: string;
  content: string;
  status: "open" | "resolved";
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createComment(
  sessionId: string,
  filePath: string,
  lineNumber: number | null,
  lineType: string | null,
  author: string,
  content: string,
  parentId: string | null = null
): Promise<DiffCommentData> {
  return invoke<DiffCommentData>("create_comment", {
    sessionId,
    filePath,
    lineNumber,
    lineType,
    author,
    content,
    parentId,
  });
}

export async function getCommentsForSession(sessionId: string): Promise<DiffCommentData[]> {
  return invoke<DiffCommentData[]>("get_comments_for_session", { sessionId });
}

export async function getOpenCommentsForSession(sessionId: string): Promise<DiffCommentData[]> {
  return invoke<DiffCommentData[]>("get_open_comments_for_session", { sessionId });
}

export async function replyToComment(parentId: string, author: string, content: string): Promise<DiffCommentData> {
  return invoke<DiffCommentData>("reply_to_comment", { parentId, author, content });
}

export async function resolveComment(id: string): Promise<void> {
  return invoke<void>("resolve_comment", { id });
}

export async function deleteComment(id: string): Promise<void> {
  return invoke<void>("delete_comment", { id });
}
