#!/bin/bash
# PreToolUse hook to validate AppleScript commands
# Only allows the window focus command for claude-sessions

# Read the JSON input from stdin
INPUT=$(cat)

# Extract the code_snippet parameter
CODE_SNIPPET=$(echo "$INPUT" | jq -r '.tool_input.code_snippet // empty')

# Normalize whitespace for comparison
NORMALIZED=$(echo "$CODE_SNIPPET" | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//')

# The only allowed command (normalized)
ALLOWED='tell application "System Events" tell process "claude-sessions" set frontmost to true end tell end tell'

if [[ "$NORMALIZED" == "$ALLOWED" ]]; then
  # Allow the command
  exit 0
else
  # Block the command
  echo "AppleScript command not allowed. Only the window focus command for claude-sessions is permitted." >&2
  exit 2
fi
