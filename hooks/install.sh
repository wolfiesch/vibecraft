#!/bin/bash
# Vibecraft Hooks Installer
#
# This script helps integrate Vibecraft hooks with your Claude Code settings.
# It generates the hook configuration that you can add to your settings.json.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer Rust binary if available, otherwise fall back to bash script
ARCH=$(uname -m)
OS=$(uname -s | tr '[:upper:]' '[:lower:]')

HOOK_PATH=""
if [ "$OS" = "darwin" ]; then
  if [ -f "$SCRIPT_DIR/bin/vibecraft-hook-darwin-universal" ]; then
    HOOK_PATH="$SCRIPT_DIR/bin/vibecraft-hook-darwin-universal"
  elif [ "$ARCH" = "arm64" ] && [ -f "$SCRIPT_DIR/bin/vibecraft-hook-darwin-arm64" ]; then
    HOOK_PATH="$SCRIPT_DIR/bin/vibecraft-hook-darwin-arm64"
  elif [ "$ARCH" = "x86_64" ] && [ -f "$SCRIPT_DIR/bin/vibecraft-hook-darwin-x64" ]; then
    HOOK_PATH="$SCRIPT_DIR/bin/vibecraft-hook-darwin-x64"
  fi
elif [ "$OS" = "linux" ] && [ "$ARCH" = "x86_64" ]; then
  if [ -f "$SCRIPT_DIR/bin/vibecraft-hook-linux-x64" ]; then
    HOOK_PATH="$SCRIPT_DIR/bin/vibecraft-hook-linux-x64"
  fi
fi

# Fall back to bash script
if [ -z "$HOOK_PATH" ]; then
  HOOK_PATH="$SCRIPT_DIR/vibecraft-hook.sh"
  HOOK_TYPE="bash script"
else
  HOOK_TYPE="Rust binary (7-10x faster)"
fi

echo "Vibecraft Hooks Configuration Generator"
echo "======================================="
echo ""
echo "Hook type: $HOOK_TYPE"
echo "Hook location: $HOOK_PATH"
echo ""
echo "Add the following to your ~/.claude/settings.json:"
echo ""
echo "------- COPY BELOW THIS LINE -------"
cat << EOF
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "Stop": [
      {
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "SessionStart": [
      {
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ],
    "Notification": [
      {
        "hooks": [{"type": "command", "command": "$HOOK_PATH", "timeout": 5}]
      }
    ]
  }
}
EOF
echo ""
echo "------- COPY ABOVE THIS LINE -------"
echo ""
echo "If you already have hooks configured, merge the above with your existing config."
echo ""
echo "Environment variables you can set:"
echo "  VIBECRAFT_DIR           - Base directory (default: ~/vibecraft)"
echo "  VIBECRAFT_EVENTS_FILE   - Events file path (default: \$VIBECRAFT_DIR/data/events.jsonl)"
echo "  VIBECRAFT_WS_NOTIFY     - WebSocket notify URL (default: http://localhost:4003/event)"
echo "  VIBECRAFT_ENABLE_WS_NOTIFY - Enable WebSocket notifications (default: true)"
