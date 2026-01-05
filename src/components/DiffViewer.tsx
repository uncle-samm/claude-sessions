import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { useDiffStore } from "../store/diffs";
import { useSessionStore } from "../store/sessions";
import { useWorkspaceStore } from "../store/workspaces";
import { useCommentStore, Comment } from "../store/comments";
import type { DiffLine, FileDiff } from "../store/api";
import { fetchOrigin, getCommitSha, updateSessionBaseCommit } from "../store/api";
import { escapeHtml, useHighlightedLines } from "./HeadlessChat/HighlightedCode";
import { getLanguageFromFilename } from "./HeadlessChat/highlighting";

interface DiffViewerProps {
  onClose: () => void;
}

export function DiffViewer({ onClose }: DiffViewerProps) {
  const { summary, expandedFiles, fileContents, isLoading, error, currentBranch, loadDiffSummary, loadFileDiff, toggleFileExpanded, loadCurrentBranch, clearDiff } = useDiffStore();
  const { sessions, activeSessionId, setBaseCommit } = useSessionStore();
  const { workspaces } = useWorkspaceStore();
  const { comments, loadComments, clearComments, getCommentsForFile } = useCommentStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [resolvedBaseRef, setResolvedBaseRef] = useState<string | null>(null);
  const [visibleFileCount, setVisibleFileCount] = useState(80);
  const prevBaseRef = useRef<string | null>(null);
  const prevSessionId = useRef<string | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const workspace = workspaces.find((w) => w.id === activeSession?.workspaceId);
  const worktreePath = activeSession?.finalCwd || activeSession?.cwd;
  const originBranch = workspace?.originBranch || "main";
  const baseRef = resolvedBaseRef;
  const diffCacheKey = activeSessionId && baseRef ? `${activeSessionId}:${baseRef}` : null;

  // Show all changes compared to base_commit (no AI scope filtering)
  const displaySummary = summary;

  useEffect(() => {
    let isActive = true;

    if (!activeSession || !worktreePath) {
      setResolvedBaseRef(null);
      return () => {
        isActive = false;
      };
    }

    if (activeSession.baseCommit) {
      setResolvedBaseRef(activeSession.baseCommit);
      return () => {
        isActive = false;
      };
    }

    getCommitSha(worktreePath, "HEAD")
      .then((commitSha) => {
        if (!isActive) return;
        setResolvedBaseRef(commitSha);
        updateSessionBaseCommit(activeSession.id, commitSha).catch((err) => {
          console.error("[DiffViewer] Failed to persist base commit:", err);
        });
        setBaseCommit(activeSession.id, commitSha);
      })
      .catch((err) => {
        console.error("[DiffViewer] Failed to resolve base commit:", err);
        if (!isActive) return;
        setResolvedBaseRef(`origin/${originBranch}`);
      });

    return () => {
      isActive = false;
    };
  }, [activeSession?.id, activeSession?.baseCommit, worktreePath, originBranch, setBaseCommit]);

  useEffect(() => {
    if (worktreePath) {
      loadCurrentBranch(worktreePath);
      if (baseRef && diffCacheKey) {
        loadDiffSummary(worktreePath, baseRef, diffCacheKey);
      }
    }
    if (activeSessionId) {
      loadComments(activeSessionId);
    }
    return () => {
      clearComments();
    };
  }, [worktreePath, baseRef, diffCacheKey, activeSessionId, loadDiffSummary, loadCurrentBranch, loadComments, clearComments]);

  useEffect(() => {
    if (prevSessionId.current === activeSessionId && prevBaseRef.current && baseRef && prevBaseRef.current !== baseRef) {
      clearDiff(`${activeSessionId}:${prevBaseRef.current}`);
    }
    prevSessionId.current = activeSessionId || null;
    prevBaseRef.current = baseRef;
  }, [activeSessionId, baseRef, clearDiff]);

  useEffect(() => {
    if (!displaySummary) return;
    setVisibleFileCount(80);
  }, [displaySummary?.total_files, diffCacheKey]);

  // Watch for file changes and refresh diff with debounce
  useEffect(() => {
    if (!worktreePath || !baseRef || !diffCacheKey) return;

    let unwatchFn: UnwatchFn | null = null;

    const setupWatcher = async () => {
      try {
        unwatchFn = await watch(
          worktreePath,
          () => {
            // Reload diff on file changes (debounced by Tauri)
            loadDiffSummary(worktreePath, baseRef, diffCacheKey, { force: true });
          },
          { recursive: true, delayMs: 500 }
        );
      } catch (err) {
        console.error("[DiffViewer] Failed to set up file watcher:", err);
      }
    };

    setupWatcher();

    return () => {
      if (unwatchFn) {
        unwatchFn();
      }
    };
  }, [worktreePath, baseRef, diffCacheKey, loadDiffSummary]);

  const handleToggleFile = (filePath: string) => {
    if (!diffCacheKey) return;
    toggleFileExpanded(filePath, diffCacheKey);
    // Load file content if expanding and not already loaded
    if (!expandedFiles.has(filePath) && !fileContents.has(filePath) && worktreePath && baseRef) {
      loadFileDiff(worktreePath, filePath, baseRef, diffCacheKey);
    }
  };

  const handleSyncWithOrigin = async () => {
    if (!worktreePath || !activeSession || isSyncing) return;

    setIsSyncing(true);
    try {
      // Fetch latest from origin
      await fetchOrigin(worktreePath);

      // Get the new commit SHA
      const newCommitSha = await getCommitSha(worktreePath, `origin/${originBranch}`);

      // Update the session's base_commit in database
      await updateSessionBaseCommit(activeSession.id, newCommitSha);

      // Update local session store so UI reflects the change
      setBaseCommit(activeSession.id, newCommitSha);
      setResolvedBaseRef(newCommitSha);

      // Clear and reload diff with new base
      loadDiffSummary(worktreePath, newCommitSha, `${activeSession.id}:${newCommitSha}`, { force: true });
      loadCurrentBranch(worktreePath);
    } catch (err) {
      console.error("[DiffViewer] Failed to sync with origin:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      added: { label: "A", className: "status-added" },
      modified: { label: "M", className: "status-modified" },
      deleted: { label: "D", className: "status-deleted" },
      renamed: { label: "R", className: "status-renamed" },
    };
    const badge = badges[status] || { label: "?", className: "" };
    return <span className={`diff-status-badge ${badge.className}`}>{badge.label}</span>;
  };

  const getFileCommentCount = (filePath: string) => {
    return getCommentsForFile(filePath).filter(c => c.status === "open" && !c.parentId).length;
  };

  if (!activeSession) {
    return (
      <div className="diff-viewer">
        <div className="diff-header">
          <h3>Diff Viewer</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="diff-empty">
          <p>No session selected</p>
        </div>
      </div>
    );
  }

  // Format the base reference for display (show short SHA if it's a commit)
  const baseRefDisplay = baseRef
    ? (/^[0-9a-f]{7,40}$/i.test(baseRef) ? baseRef.slice(0, 8) : baseRef)
    : `origin/${originBranch}`;

  const visibleFiles = displaySummary ? displaySummary.files.slice(0, visibleFileCount) : [];
  const hasMoreFiles = displaySummary ? displaySummary.files.length > visibleFileCount : false;
  const remainingFiles = displaySummary ? displaySummary.files.length - visibleFileCount : 0;

  return (
    <div className="diff-viewer" data-testid="diff-panel">
      <div className="diff-header" data-testid="diff-header">
        <div className="diff-title">
          <h3>Changes</h3>
          <span className="diff-branch-info">
            {currentBranch} → {baseRefDisplay}
          </span>
        </div>
        <div className="diff-header-actions">
          {workspace && (
            <button
              className="sync-btn"
              onClick={handleSyncWithOrigin}
              disabled={isSyncing}
              title="Sync with origin to update the base commit"
            >
              {isSyncing ? "Syncing..." : "Sync with Origin"}
            </button>
          )}
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
      </div>

      {isLoading && (
        <div className="diff-loading">
          <span className="spinner"></span>
          <span>Loading diff...</span>
        </div>
      )}

      {error && (
        <div className="diff-error">
          <span className="error-icon">!</span>
          <span>{error}</span>
        </div>
      )}

      {displaySummary && !isLoading && (
        <>
          <div className="diff-summary">
            <span className="diff-stat">
              <span className="diff-files">{displaySummary.total_files} file{displaySummary.total_files !== 1 ? 's' : ''}</span>
              <span className="diff-insertions">+{displaySummary.total_insertions}</span>
              <span className="diff-deletions">-{displaySummary.total_deletions}</span>
              {comments.filter(c => c.status === "open" && !c.parentId).length > 0 && (
                <span className="diff-comments-count">
                  {comments.filter(c => c.status === "open" && !c.parentId).length} comment{comments.filter(c => c.status === "open" && !c.parentId).length !== 1 ? 's' : ''}
                </span>
              )}
            </span>
          </div>

          <div className="diff-file-list" data-testid="diff-file-list">
            {displaySummary.files.length === 0 ? (
              <div className="diff-empty">
                <p>No changes detected</p>
              </div>
            ) : (
              visibleFiles.map((file) => {
                const commentCount = getFileCommentCount(file.path);
                return (
                  <div key={file.path} className="diff-file" data-testid="diff-file-item">
                    <div
                      className={`diff-file-header ${expandedFiles.has(file.path) ? 'expanded' : ''}`}
                      onClick={() => handleToggleFile(file.path)}
                    >
                      <span className={`chevron ${expandedFiles.has(file.path) ? 'expanded' : ''}`}>›</span>
                      {getStatusBadge(file.status)}
                      <span className="diff-file-path">{file.path}</span>
                      {commentCount > 0 && (
                        <span className="diff-file-comments">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          {commentCount}
                        </span>
                      )}
                      <span className="diff-file-stats">
                        <span className="diff-insertions">+{file.insertions}</span>
                        <span className="diff-deletions">-{file.deletions}</span>
                      </span>
                    </div>

                    {expandedFiles.has(file.path) && (
                      <div className="diff-file-content">
                        {fileContents.has(file.path) ? (
                          <FileHunks
                            file={fileContents.get(file.path)!}
                            sessionId={activeSession.id}
                            comments={getCommentsForFile(file.path)}
                          />
                        ) : (
                          <div className="diff-loading-file">Loading...</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {hasMoreFiles && (
            <div className="diff-file-list-footer">
              <button
                className="diff-load-more"
                onClick={() =>
                  setVisibleFileCount((count) =>
                    Math.min(count + 80, displaySummary.files.length)
                  )
                }
              >
                Load more files ({remainingFiles} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface FileHunksProps {
  file: FileDiff;
  sessionId: string;
  comments: Comment[];
}

function FileHunks({ file, sessionId, comments }: FileHunksProps) {
  if (file.hunks.length === 0) {
    return <div className="diff-no-hunks">No content changes</div>;
  }
  const language = getLanguageFromFilename(file.path);

  return (
    <div className="diff-hunks">
      {file.hunks.map((hunk, hunkIndex) => (
        <DiffHunkBlock
          key={hunkIndex}
          hunk={hunk}
          filePath={file.path}
          sessionId={sessionId}
          comments={comments}
          language={language}
        />
      ))}
    </div>
  );
}

function DiffHunkBlock({
  hunk,
  filePath,
  sessionId,
  comments,
  language,
}: {
  hunk: FileDiff["hunks"][number];
  filePath: string;
  sessionId: string;
  comments: Comment[];
  language?: string;
}) {
  const hunkContent = useMemo(
    () => hunk.lines.map((line) => line.content || " ").join("\n"),
    [hunk.lines],
  );
  const highlightedLines = useHighlightedLines(hunkContent, language, { defer: true });

  return (
    <div className="diff-hunk" data-testid="diff-hunk">
      <div className="diff-hunk-header">{hunk.header}</div>
      <div className="diff-lines">
        {hunk.lines.map((line, lineIndex) => (
          <DiffLineRow
            key={lineIndex}
            line={line}
            filePath={filePath}
            sessionId={sessionId}
            comments={comments}
            highlightHtml={highlightedLines?.[lineIndex] ?? null}
          />
        ))}
      </div>
    </div>
  );
}

interface DiffLineRowProps {
  line: DiffLine;
  filePath: string;
  sessionId: string;
  comments: Comment[];
  highlightHtml?: string | null;
}

function DiffLineRow({ line, filePath, sessionId, comments, highlightHtml }: DiffLineRowProps) {
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentText, setCommentText] = useState("");
  const { addComment, resolveComment } = useCommentStore();

  const lineNumber = line.line_type === "delete" ? line.old_line : line.new_line;
  const lineComments = comments.filter(
    (c) => c.lineNumber === lineNumber && c.lineType === line.line_type && !c.parentId
  );

  const lineClass = `diff-line diff-line-${line.line_type}`;
  const prefix = line.line_type === "add" ? "+" : line.line_type === "delete" ? "-" : " ";
  const rawContent = line.content || " ";
  const contentHtml = highlightHtml ?? escapeHtml(rawContent);

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    await addComment(sessionId, filePath, lineNumber, line.line_type, commentText.trim());
    setCommentText("");
    setShowCommentInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleAddComment();
    } else if (e.key === "Escape") {
      setShowCommentInput(false);
      setCommentText("");
    }
  };

  return (
    <>
      <div className={lineClass}>
        <span className="diff-line-number old">{line.old_line ?? ""}</span>
        <span className="diff-line-number new">{line.new_line ?? ""}</span>
        <span className="diff-line-prefix">{prefix}</span>
        <span className="diff-line-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />
        <button
          className="diff-line-comment-btn"
          onClick={() => setShowCommentInput(!showCommentInput)}
          title="Add comment"
        >
          +
        </button>
        {lineComments.length > 0 && (
          <span className="diff-line-comment-indicator">{lineComments.length}</span>
        )}
      </div>

      {/* Existing comments */}
      {lineComments.map((comment) => {
        // Get replies for this comment
        const replies = comments.filter((c) => c.parentId === comment.id);

        return (
          <div key={comment.id} className="diff-comment-thread">
            <div className={`diff-comment ${comment.status === "resolved" ? "resolved" : ""}`}>
              <div className="diff-comment-header">
                <span className="diff-comment-author">{comment.author === "user" ? "You" : comment.author}</span>
                <span className="diff-comment-time">{formatTime(comment.createdAt)}</span>
                {comment.status === "open" && (
                  <button
                    className="diff-comment-resolve"
                    onClick={() => resolveComment(comment.id)}
                    title="Resolve"
                  >
                    ✓
                  </button>
                )}
              </div>
              <div className="diff-comment-content">{comment.content}</div>
            </div>
            {/* Replies */}
            {replies.map((reply) => (
              <div key={reply.id} className={`diff-comment diff-comment-reply ${reply.status === "resolved" ? "resolved" : ""}`}>
                <div className="diff-comment-header">
                  <span className="diff-comment-author">{reply.author === "user" ? "You" : reply.author}</span>
                  <span className="diff-comment-time">{formatTime(reply.createdAt)}</span>
                </div>
                <div className="diff-comment-content">{reply.content}</div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Comment input */}
      {showCommentInput && (
        <div className="diff-comment-input-wrapper">
          <textarea
            className="diff-comment-input"
            placeholder="Write a comment... (Cmd+Enter to submit)"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="diff-comment-input-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setShowCommentInput(false);
                setCommentText("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAddComment}
              disabled={!commentText.trim()}
            >
              Comment
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
