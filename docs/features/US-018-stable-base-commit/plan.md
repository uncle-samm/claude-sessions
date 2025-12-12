# Plan: Stable Base Commit Diff

## Goal
Store the git commit SHA at session start so diffs remain stable while working.

## Implementation Steps

### 1. Database (db.rs)
- Add `base_commit: Option<String>` to Session struct
- Add column to CREATE TABLE
- Add migration for existing DBs
- Update create_session INSERT
- Update get_all_sessions/get_session SELECT

### 2. Git Helper (git.rs)
```rust
pub fn get_commit_sha(worktree_path: &str, ref_name: &str) -> Result<String, String>
// Returns: git rev-parse origin/<branch> or <branch>
```

### 3. IPC (lib.rs)
- Add base_commit to SessionData struct
- Add `update_session_base_commit` command
- Add `get_commit_sha` command

### 4. Frontend
- Add baseCommit to Session interface
- After worktree setup, get commit SHA
- Pass to session creation
- DiffViewer uses session.baseCommit if available

### 5. Sync Button
- Button in diff panel header
- Calls git fetch + rev-parse
- Updates session.base_commit
- Refreshes diff

## Commit Points
- After db.rs changes: `git commit -m "feat(db): add base_commit to sessions"`
- After git.rs: `git commit -m "feat(git): add get_commit_sha helper"`
- After IPC: `git commit -m "feat(ipc): expose base_commit operations"`
- After frontend: `git commit -m "feat(ui): use stable base_commit for diffs"`
