# Plan

1. Confirm US-029 docs are in place before code changes.
2. Resolve diff baseline issues (prefer finalCwd, backfill base_commit from HEAD, update session cwd in store).
3. Track AI-touched files from tool calls and normalize paths for diff scoping.
4. Scope diff viewer output to AI-touched files when available and show scope indicator.
5. Include untracked files in diff summaries and allow file diffs for new files.
6. Update worktree setup to prefer origin/<branch> and pass origin branch to the script.
7. Harden git diff calls (ignore submodules) and validate behavior.
