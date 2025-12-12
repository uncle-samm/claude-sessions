use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,  // For renames
    pub status: String,            // "added", "modified", "deleted", "renamed"
    pub insertions: u32,
    pub deletions: u32,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub line_type: String,  // "context", "add", "delete"
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub files: Vec<FileDiff>,
    pub total_insertions: u32,
    pub total_deletions: u32,
    pub total_files: u32,
}

/// Get a summary of changes between the worktree and a base branch
pub fn get_diff_summary(worktree_path: &str, base_branch: &str) -> Result<DiffSummary, String> {
    let path = Path::new(worktree_path);

    // Get list of changed files with stats
    let output = Command::new("git")
        .current_dir(path)
        .args(["diff", "--numstat", base_branch])
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut files = Vec::new();
    let mut total_insertions = 0u32;
    let mut total_deletions = 0u32;

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let insertions = parts[0].parse::<u32>().unwrap_or(0);
            let deletions = parts[1].parse::<u32>().unwrap_or(0);
            let file_path = parts[2].to_string();

            // Determine file status
            let status = get_file_status(path, &file_path, base_branch)?;

            total_insertions += insertions;
            total_deletions += deletions;

            files.push(FileDiff {
                path: file_path,
                old_path: None,
                status,
                insertions,
                deletions,
                hunks: Vec::new(), // Hunks loaded separately
            });
        }
    }

    Ok(DiffSummary {
        total_files: files.len() as u32,
        files,
        total_insertions,
        total_deletions,
    })
}

/// Get file status (added, modified, deleted, renamed)
fn get_file_status(worktree_path: &Path, file_path: &str, base_branch: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["diff", "--name-status", base_branch, "--", file_path])
        .output()
        .map_err(|e| format!("Failed to get file status: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_char = stdout.chars().next().unwrap_or('M');

    Ok(match first_char {
        'A' => "added".to_string(),
        'D' => "deleted".to_string(),
        'R' => "renamed".to_string(),
        'C' => "copied".to_string(),
        _ => "modified".to_string(),
    })
}

/// Get detailed diff for a specific file with hunks
pub fn get_file_diff(worktree_path: &str, file_path: &str, base_branch: &str) -> Result<FileDiff, String> {
    let path = Path::new(worktree_path);

    // Get the unified diff for this file
    let output = Command::new("git")
        .current_dir(path)
        .args(["diff", "-U3", base_branch, "--", file_path])
        .output()
        .map_err(|e| format!("Failed to get file diff: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff failed: {}", stderr));
    }

    let diff_content = String::from_utf8_lossy(&output.stdout);
    parse_unified_diff(&diff_content, file_path)
}

/// Parse a unified diff format into structured data
fn parse_unified_diff(diff: &str, file_path: &str) -> Result<FileDiff, String> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<DiffHunk> = None;
    let mut insertions = 0u32;
    let mut deletions = 0u32;
    let mut old_line = 0u32;
    let mut new_line = 0u32;
    let mut status = "modified".to_string();

    for line in diff.lines() {
        // Check for new file indicator
        if line.starts_with("new file mode") {
            status = "added".to_string();
        } else if line.starts_with("deleted file mode") {
            status = "deleted".to_string();
        } else if line.starts_with("@@") {
            // Save previous hunk if exists
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }

            // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
            if let Some((old_start, old_count, new_start, new_count)) = parse_hunk_header(line) {
                old_line = old_start;
                new_line = new_start;
                current_hunk = Some(DiffHunk {
                    old_start,
                    old_count,
                    new_start,
                    new_count,
                    header: line.to_string(),
                    lines: Vec::new(),
                });
            }
        } else if let Some(ref mut hunk) = current_hunk {
            let (line_type, content) = if line.starts_with('+') && !line.starts_with("+++") {
                insertions += 1;
                let diff_line = DiffLine {
                    line_type: "add".to_string(),
                    old_line: None,
                    new_line: Some(new_line),
                    content: line[1..].to_string(),
                };
                new_line += 1;
                (Some(diff_line), true)
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
                let diff_line = DiffLine {
                    line_type: "delete".to_string(),
                    old_line: Some(old_line),
                    new_line: None,
                    content: line[1..].to_string(),
                };
                old_line += 1;
                (Some(diff_line), true)
            } else if line.starts_with(' ') || line.is_empty() {
                let content = if line.is_empty() { "" } else { &line[1..] };
                let diff_line = DiffLine {
                    line_type: "context".to_string(),
                    old_line: Some(old_line),
                    new_line: Some(new_line),
                    content: content.to_string(),
                };
                old_line += 1;
                new_line += 1;
                (Some(diff_line), true)
            } else {
                (None, false)
            };

            if content {
                if let Some(diff_line) = line_type {
                    hunk.lines.push(diff_line);
                }
            }
        }
    }

    // Don't forget the last hunk
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    Ok(FileDiff {
        path: file_path.to_string(),
        old_path: None,
        status,
        insertions,
        deletions,
        hunks,
    })
}

/// Parse hunk header like "@@ -1,5 +1,7 @@"
fn parse_hunk_header(header: &str) -> Option<(u32, u32, u32, u32)> {
    let header = header.trim_start_matches("@@ ");
    let parts: Vec<&str> = header.split_whitespace().collect();

    if parts.len() < 2 {
        return None;
    }

    let old_part = parts[0].trim_start_matches('-');
    let new_part = parts[1].trim_start_matches('+');

    let (old_start, old_count) = parse_line_range(old_part)?;
    let (new_start, new_count) = parse_line_range(new_part)?;

    Some((old_start, old_count, new_start, new_count))
}

fn parse_line_range(range: &str) -> Option<(u32, u32)> {
    if let Some(comma_pos) = range.find(',') {
        let start = range[..comma_pos].parse().ok()?;
        let count = range[comma_pos + 1..].parse().ok()?;
        Some((start, count))
    } else {
        let start = range.parse().ok()?;
        Some((start, 1))
    }
}

/// Get the current branch name
pub fn get_current_branch(worktree_path: &str) -> Result<String, String> {
    let path = Path::new(worktree_path);

    let output = Command::new("git")
        .current_dir(path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get current branch".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Check if a branch exists in the repository
pub fn branch_exists(worktree_path: &str, branch: &str) -> bool {
    let path = Path::new(worktree_path);

    let output = Command::new("git")
        .current_dir(path)
        .args(["rev-parse", "--verify", branch])
        .output();

    match output {
        Ok(result) => result.status.success(),
        Err(_) => false,
    }
}

/// Get the commit SHA for a given ref (branch name, HEAD, origin/branch, etc.)
pub fn get_commit_sha(worktree_path: &str, ref_name: &str) -> Result<String, String> {
    let path = Path::new(worktree_path);

    let output = Command::new("git")
        .current_dir(path)
        .args(["rev-parse", ref_name])
        .output()
        .map_err(|e| format!("Failed to run git rev-parse: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git rev-parse failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Fetch from remote origin
pub fn fetch_origin(worktree_path: &str) -> Result<(), String> {
    let path = Path::new(worktree_path);

    let output = Command::new("git")
        .current_dir(path)
        .args(["fetch", "origin"])
        .output()
        .map_err(|e| format!("Failed to run git fetch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git fetch failed: {}", stderr));
    }

    Ok(())
}
