# Claude Sessions

A desktop app for managing multiple Claude Code sessions with a visual sidebar.

## Features

- **Multiple sessions**: Run several Claude Code instances side-by-side
- **Sidebar navigation**: Quickly switch between active sessions
- **Unread indicators**: Red dot shows when a session is waiting for input
- **Desktop notifications**: Get alerted when background sessions need attention
- **Per-session directories**: Each session can have its own working directory

## Preview

```
┌────────────┬─────────────────────────────┐
│ Sessions   │  Terminal                   │
│            │                             │
│ [+ New]    │  $ claude                   │
│            │  > Working on feature...    │
│ 🔴 Project │                             │
│ ○ API      │                             │
│ ○ Tests    │                             │
└────────────┴─────────────────────────────┘
```

## Tech Stack

- **Tauri 2.0** - Lightweight app shell (~5MB binary)
- **React 18** - Frontend UI
- **TypeScript** - Type safety
- **xterm.js** - Terminal emulation
- **tauri-plugin-shell** - PTY spawning
- **tauri-plugin-notification** - Desktop notifications

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

## Build

```bash
# Build for production
npm run tauri build
```

## Project Structure

```
claude-sessions/
├── src/                      # React frontend
│   ├── App.tsx               # Main app layout
│   ├── components/
│   │   ├── Sidebar.tsx       # Session list with indicators
│   │   ├── Terminal.tsx      # xterm.js wrapper
│   │   └── SessionTab.tsx    # Individual session tab
│   ├── hooks/
│   │   ├── useSession.ts     # Session state management
│   │   └── usePty.ts         # PTY spawning logic
│   └── stores/
│       └── sessions.ts       # Session state
├── src-tauri/                # Rust backend (minimal)
│   ├── src/main.rs           # Plugin wiring
│   ├── Cargo.toml            # Dependencies
│   └── tauri.conf.json       # App config
└── package.json
```

## How It Works

1. Each session spawns a PTY running your shell (`zsh -l`)
2. xterm.js renders the terminal output in the UI
3. Output is monitored for Claude's input prompt pattern
4. When detected, the sidebar shows an unread indicator
5. If the session isn't focused, a desktop notification is sent

## License

MIT
