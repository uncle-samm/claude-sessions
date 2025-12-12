use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Global database connection
static DB: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub script_path: Option<String>,
    pub origin_branch: String,  // Branch to compare diffs against (default: "main")
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub workspace_id: Option<String>,
    pub worktree_name: Option<String>,
    pub status: String, // "ready" or "busy"
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboxMessage {
    pub id: String,
    pub session_id: String,
    pub session_name: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub read_at: Option<DateTime<Utc>>,
    pub first_read_at: Option<DateTime<Utc>>,  // Set once when first read, never cleared
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffComment {
    pub id: String,
    pub session_id: String,
    pub file_path: String,
    pub line_number: Option<i32>,  // Line in diff (null for file-level comments)
    pub line_type: Option<String>, // "add", "delete", "context" or null
    pub author: String,            // "user" or session_id (Claude)
    pub content: String,
    pub status: String,            // "open", "resolved"
    pub parent_id: Option<String>, // For threaded replies
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub fn get_db_path() -> PathBuf {
    // Use platform-specific app data directory
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.samb.claude-sessions");

    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("sessions.db")
}

pub fn init_db() -> Result<()> {
    let db_path = get_db_path();
    println!("[DB] Initializing database at: {:?}", db_path);

    let conn = Connection::open(&db_path)?;

    // Create workspaces table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            folder TEXT NOT NULL,
            script_path TEXT,
            origin_branch TEXT NOT NULL DEFAULT 'main',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Migration: Add origin_branch column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE workspaces ADD COLUMN origin_branch TEXT NOT NULL DEFAULT 'main'",
        [],
    );

    // Create sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cwd TEXT NOT NULL,
            workspace_id TEXT,
            worktree_name TEXT,
            status TEXT NOT NULL DEFAULT 'busy',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        )",
        [],
    )?;

    // Create inbox_messages table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS inbox_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at TEXT,
            first_read_at TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Migration: Add first_read_at column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE inbox_messages ADD COLUMN first_read_at TEXT",
        [],
    );

    // Create diff_comments table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS diff_comments (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_number INTEGER,
            line_type TEXT,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            parent_id TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES diff_comments(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Store connection globally
    *DB.lock().unwrap() = Some(conn);

    println!("[DB] Database initialized successfully");
    Ok(())
}

pub fn with_db<F, T>(f: F) -> Result<T>
where
    F: FnOnce(&Connection) -> Result<T>,
{
    let guard = DB.lock().unwrap();
    let conn = guard.as_ref().ok_or(rusqlite::Error::InvalidQuery)?;
    f(conn)
}

// Workspace CRUD
pub fn create_workspace(workspace: &Workspace) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO workspaces (id, name, folder, script_path, origin_branch, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![workspace.id, workspace.name, workspace.folder, workspace.script_path, workspace.origin_branch, workspace.created_at.to_rfc3339()],
        )?;
        Ok(())
    })
}

pub fn get_all_workspaces() -> Result<Vec<Workspace>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT id, name, folder, script_path, origin_branch, created_at FROM workspaces ORDER BY created_at")?;
        let workspaces = stmt.query_map([], |row| {
            let created_at_str: String = row.get(5)?;
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                folder: row.get(2)?,
                script_path: row.get(3)?,
                origin_branch: row.get::<_, Option<String>>(4)?.unwrap_or_else(|| "main".to_string()),
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(workspaces)
    })
}

pub fn delete_workspace(id: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])?;
        Ok(())
    })
}

// Session CRUD
pub fn create_session(session: &Session) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO sessions (id, name, cwd, workspace_id, worktree_name, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                session.id,
                session.name,
                session.cwd,
                session.workspace_id,
                session.worktree_name,
                session.status,
                session.created_at.to_rfc3339(),
                session.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    })
}

pub fn get_all_sessions() -> Result<Vec<Session>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, cwd, workspace_id, worktree_name, status, created_at, updated_at
             FROM sessions ORDER BY created_at"
        )?;
        let sessions = stmt.query_map([], |row| {
            let created_at_str: String = row.get(6)?;
            let updated_at_str: String = row.get(7)?;
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                cwd: row.get(2)?,
                workspace_id: row.get(3)?,
                worktree_name: row.get(4)?,
                status: row.get(5)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(sessions)
    })
}

pub fn get_session(id: &str) -> Result<Option<Session>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, cwd, workspace_id, worktree_name, status, created_at, updated_at
             FROM sessions WHERE id = ?1"
        )?;
        let mut rows = stmt.query(params![id])?;

        if let Some(row) = rows.next()? {
            let created_at_str: String = row.get(6)?;
            let updated_at_str: String = row.get(7)?;
            Ok(Some(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                cwd: row.get(2)?,
                workspace_id: row.get(3)?,
                worktree_name: row.get(4)?,
                status: row.get(5)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            }))
        } else {
            Ok(None)
        }
    })
}

pub fn update_session_status(id: &str, status: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE sessions SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    })
}

pub fn delete_session(id: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn rename_session(id: &str, name: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE sessions SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    })
}

pub fn update_session_cwd(id: &str, cwd: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE sessions SET cwd = ?1, updated_at = ?2 WHERE id = ?3",
            params![cwd, Utc::now().to_rfc3339(), id],
        )?;
        Ok(())
    })
}

// Inbox Message CRUD
pub fn create_inbox_message(session_id: &str, message: &str) -> Result<InboxMessage> {
    with_db(|conn| {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now();

        conn.execute(
            "INSERT INTO inbox_messages (id, session_id, message, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, session_id, message, created_at.to_rfc3339()],
        )?;

        // Get session name for the response
        let session_name: String = conn.query_row(
            "SELECT name FROM sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        ).unwrap_or_else(|_| "Unknown".to_string());

        Ok(InboxMessage {
            id,
            session_id: session_id.to_string(),
            session_name,
            message: message.to_string(),
            created_at,
            read_at: None,
            first_read_at: None,
        })
    })
}

pub fn get_all_inbox_messages() -> Result<Vec<InboxMessage>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT m.id, m.session_id, s.name, m.message, m.created_at, m.read_at, m.first_read_at
             FROM inbox_messages m
             LEFT JOIN sessions s ON m.session_id = s.id
             ORDER BY m.created_at DESC"
        )?;
        let messages = stmt.query_map([], |row| {
            let created_at_str: String = row.get(4)?;
            let read_at_str: Option<String> = row.get(5)?;
            let first_read_at_str: Option<String> = row.get(6)?;
            Ok(InboxMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                session_name: row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "Unknown".to_string()),
                message: row.get(3)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                read_at: read_at_str.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|dt| dt.with_timezone(&Utc))
                        .ok()
                }),
                first_read_at: first_read_at_str.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|dt| dt.with_timezone(&Utc))
                        .ok()
                }),
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(messages)
    })
}

pub fn mark_message_read(id: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    with_db(|conn| {
        // Set read_at, and set first_read_at only if it's NULL (first time reading)
        conn.execute(
            "UPDATE inbox_messages SET read_at = ?1, first_read_at = COALESCE(first_read_at, ?1) WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    })
}

pub fn mark_message_unread(id: &str) -> Result<()> {
    with_db(|conn| {
        // Only clear read_at, keep first_read_at to indicate it was previously read
        conn.execute(
            "UPDATE inbox_messages SET read_at = NULL WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    })
}

// Mark all messages for a session as read
pub fn mark_session_messages_read(session_id: &str) -> Result<u32> {
    let now = Utc::now().to_rfc3339();
    with_db(|conn| {
        let count = conn.execute(
            "UPDATE inbox_messages SET read_at = ?1, first_read_at = COALESCE(first_read_at, ?1)
             WHERE session_id = ?2 AND read_at IS NULL",
            params![now, session_id],
        )?;
        Ok(count as u32)
    })
}

pub fn delete_inbox_message(id: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM inbox_messages WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn clear_inbox() -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM inbox_messages", [])?;
        Ok(())
    })
}

// Diff Comment CRUD
pub fn create_comment(
    session_id: &str,
    file_path: &str,
    line_number: Option<i32>,
    line_type: Option<&str>,
    author: &str,
    content: &str,
    parent_id: Option<&str>,
) -> Result<DiffComment> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();

    with_db(|conn| {
        conn.execute(
            "INSERT INTO diff_comments (id, session_id, file_path, line_number, line_type, author, content, status, parent_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?9, ?9)",
            params![id, session_id, file_path, line_number, line_type, author, content, parent_id, now.to_rfc3339()],
        )?;

        Ok(DiffComment {
            id,
            session_id: session_id.to_string(),
            file_path: file_path.to_string(),
            line_number,
            line_type: line_type.map(String::from),
            author: author.to_string(),
            content: content.to_string(),
            status: "open".to_string(),
            parent_id: parent_id.map(String::from),
            created_at: now,
            updated_at: now,
        })
    })
}

pub fn get_comments_for_session(session_id: &str) -> Result<Vec<DiffComment>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, file_path, line_number, line_type, author, content, status, parent_id, created_at, updated_at
             FROM diff_comments
             WHERE session_id = ?1
             ORDER BY created_at ASC"
        )?;
        let comments = stmt.query_map(params![session_id], |row| {
            let created_at_str: String = row.get(9)?;
            let updated_at_str: String = row.get(10)?;
            Ok(DiffComment {
                id: row.get(0)?,
                session_id: row.get(1)?,
                file_path: row.get(2)?,
                line_number: row.get(3)?,
                line_type: row.get(4)?,
                author: row.get(5)?,
                content: row.get(6)?,
                status: row.get(7)?,
                parent_id: row.get(8)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(comments)
    })
}

pub fn get_open_comments_for_session(session_id: &str) -> Result<Vec<DiffComment>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, file_path, line_number, line_type, author, content, status, parent_id, created_at, updated_at
             FROM diff_comments
             WHERE session_id = ?1 AND status = 'open' AND parent_id IS NULL
             ORDER BY created_at ASC"
        )?;
        let comments = stmt.query_map(params![session_id], |row| {
            let created_at_str: String = row.get(9)?;
            let updated_at_str: String = row.get(10)?;
            Ok(DiffComment {
                id: row.get(0)?,
                session_id: row.get(1)?,
                file_path: row.get(2)?,
                line_number: row.get(3)?,
                line_type: row.get(4)?,
                author: row.get(5)?,
                content: row.get(6)?,
                status: row.get(7)?,
                parent_id: row.get(8)?,
                created_at: DateTime::parse_from_rfc3339(&created_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
            })
        })?.collect::<Result<Vec<_>>>()?;
        Ok(comments)
    })
}

pub fn reply_to_comment(parent_id: &str, author: &str, content: &str) -> Result<DiffComment> {
    // Get parent comment to copy session_id, file_path, line_number
    let parent = with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT session_id, file_path, line_number, line_type FROM diff_comments WHERE id = ?1"
        )?;
        let mut rows = stmt.query(params![parent_id])?;
        if let Some(row) = rows.next()? {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i32>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        } else {
            Err(rusqlite::Error::QueryReturnedNoRows)
        }
    })?;

    create_comment(
        &parent.0,
        &parent.1,
        parent.2,
        parent.3.as_deref(),
        author,
        content,
        Some(parent_id),
    )
}

pub fn resolve_comment(id: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    with_db(|conn| {
        conn.execute(
            "UPDATE diff_comments SET status = 'resolved', updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    })
}

pub fn update_comment(id: &str, content: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    with_db(|conn| {
        conn.execute(
            "UPDATE diff_comments SET content = ?1, updated_at = ?2 WHERE id = ?3",
            params![content, now, id],
        )?;
        Ok(())
    })
}

pub fn delete_comment(id: &str) -> Result<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM diff_comments WHERE id = ?1", params![id])?;
        Ok(())
    })
}
