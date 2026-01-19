#!/bin/bash
# Vibecraft Plugin Installer
# This script sets up Vibecraft as a Claude Code plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "Installing Vibecraft..."

# Check dependencies
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required but not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required but not installed."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required but not installed."; exit 1; }
command -v tmux >/dev/null 2>&1 || { echo "Error: tmux is required but not installed."; exit 1; }

# Install npm dependencies
echo "Installing dependencies..."
cd "$PLUGIN_DIR"
npm install

# Create data directory
mkdir -p "$PLUGIN_DIR/data"

# Make hook scripts/binaries executable
chmod +x "$PLUGIN_DIR/hooks/vibecraft-hook.sh" 2>/dev/null || true
# Also make any Rust binaries executable
for binary in "$PLUGIN_DIR/hooks/bin/vibecraft-hook-"*; do
  [ -f "$binary" ] && chmod +x "$binary"
done

# Check if Claude Code settings file exists
CLAUDE_SETTINGS="$HOME/.claude/settings.json"

if [ -f "$CLAUDE_SETTINGS" ]; then
  echo ""
  echo "Found existing Claude Code settings at: $CLAUDE_SETTINGS"
  echo ""
  echo "To enable Vibecraft hooks, add this to your settings.json hooks section:"
  echo ""
  echo "NOTE: It's recommended to run 'npx vibecraft setup' instead, which auto-detects"
  echo "      the best hook type (Rust binary or bash script) for your platform."
  echo ""
  echo "Manual configuration example (replace HOOK_PATH with your actual hook path):"
  cat << 'EOF'
{
  "hooks": {
    "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "HOOK_PATH"}]}],
    "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "HOOK_PATH"}]}],
    "Stop": [{"matcher": "", "hooks": [{"type": "command", "command": "HOOK_PATH"}]}],
    "UserPromptSubmit": [{"matcher": "", "hooks": [{"type": "command", "command": "HOOK_PATH"}]}]
  }
}
EOF
  echo ""
  echo "Get your hook path with: npx vibecraft --hook-path"
else
  echo "Creating Claude Code settings directory..."
  mkdir -p "$HOME/.claude"
fi

echo ""
echo "Installation complete!"
echo ""
echo "To start Vibecraft:"
echo "  cd $PLUGIN_DIR && npm run dev"
echo ""
echo "Then open http://localhost:4002 in your browser."
