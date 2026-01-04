#!/bin/zsh
# Setup script for Claude Sessions workspace
# Creates a git worktree for isolated development
# Note: MCP configuration is handled by the Tauri app after this script runs

set -e  # Exit on error

REPO_ROOT=~/Documents/Repositories/Personal/claude-sessions
WORKTREES_DIR=~/Documents/Repositories/Personal/claude-sessions-worktrees

# Create worktrees directory if it doesn't exist
mkdir -p "$WORKTREES_DIR"

# Use provided worktree name from env var, or generate a fallback
if [[ -n "$CLAUDE_WORKTREE_NAME" ]]; then
  WORKTREE_NAME="$CLAUDE_WORKTREE_NAME"
else
  # Fallback: generate name based on timestamp
  WORKTREE_NAME="session-$(date +%Y%m%d-%H%M%S)"
fi

BRANCH_NAME="session/$WORKTREE_NAME"
WORKTREE_PATH="$WORKTREES_DIR/$WORKTREE_NAME"
BASE_BRANCH="${CLAUDE_ORIGIN_BRANCH:-main}"
BASE_REF="origin/$BASE_BRANCH"

echo "Creating worktree: $WORKTREE_NAME"
echo "Branch: $BRANCH_NAME"

# Navigate to repo root first
cd "$REPO_ROOT"

# Try to ensure origin has the latest base branch
if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin "$BASE_BRANCH" >/dev/null 2>&1 || true
fi

# Fall back if the remote branch does not exist
if ! git show-ref --verify --quiet "refs/remotes/$BASE_REF"; then
  if git show-ref --verify --quiet "refs/remotes/origin/master"; then
    BASE_REF="origin/master"
  elif git show-ref --verify --quiet "refs/heads/$BASE_BRANCH"; then
    BASE_REF="$BASE_BRANCH"
  elif git show-ref --verify --quiet "refs/heads/master"; then
    BASE_REF="master"
  else
    BASE_REF="HEAD"
  fi
fi

echo "Base ref: $BASE_REF"

# Create new branch and worktree
git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" "$BASE_REF"

echo "Worktree created at: $WORKTREE_PATH"

# CD into the new worktree
cd "$WORKTREE_PATH"

echo "Workspace ready!"
