# Vibecraft Setup Guide

Complete installation and troubleshooting guide for Vibecraft.

## What is Vibecraft?

Vibecraft visualizes Claude Code's activity in real-time as a 3D workshop. When Claude uses tools (Read, Edit, Bash, etc.), a character moves to corresponding workstations.

**Two parts:**
1. **Hooks** - Capture events from Claude Code
2. **Server** - WebSocket server + 3D browser visualization

```
┌─────────────────┐      hooks       ┌─────────────────┐
│  Claude Code    │ ───────────────→ │  Vibecraft      │
│  (your CLI)     │                  │  Server (:4003) │
└─────────────────┘                  └────────┬────────┘
                                              │
                                              ↓ WebSocket
                                     ┌─────────────────┐
                                     │  Browser        │
                                     │  (3D Scene)     │
                                     └─────────────────┘
```

---

## Quick Start (3 steps)

### Step 1: Install dependencies

```bash
# macOS
brew install jq tmux

# Ubuntu/Debian
sudo apt install jq tmux

# Arch
pacman -S jq tmux
```

### Step 2: Configure hooks

```bash
npx vibecraft setup
```

This automatically adds hooks to `~/.claude/settings.json`.

### Step 3: Start server and use Claude

```bash
# Terminal 1: Start Vibecraft server
npx vibecraft

# Terminal 2: Use Claude Code normally
claude
```

Open http://localhost:4003 in your browser.

**That's it!** Every time Claude uses a tool, you'll see it in the 3D visualization.

---

## Prerequisites Explained

| Dependency | Required? | Purpose |
|------------|-----------|---------|
| **Node.js 18+** | Yes | Runs the server |
| **jq** | Rust hook: No, Bash hook: Yes | JSON processing in bash hook scripts |
| **curl** | Recommended | HTTP notifications (optional - events saved to JSONL anyway) |
| **tmux** | Optional | Session management, browser→Claude prompts |

**Note:** Vibecraft automatically uses the high-performance **Rust hook** (7-10x faster) on supported platforms (macOS arm64/x64, Linux x64). On other platforms, it falls back to the bash hook which requires `jq`.

**Check if installed:**
```bash
node --version   # Should be 18+
jq --version     # Should output version (for bash hook)
curl --version   # Should output version (recommended)
tmux -V          # Should output version (optional)
```

---

## Hook Configuration Options

### Option A: Automatic (Recommended)

```bash
npx vibecraft setup
```

This:
- Installs Rust hook binary to `~/.vibecraft/hooks/vibecraft-hook` (or bash script as fallback)
- Creates `~/.vibecraft/data/` directory
- Configures all 8 hooks in `~/.claude/settings.json`
- Backs up existing settings
- Checks for curl (optional for real-time notifications) and tmux (optional for browser prompts)

**After setup, restart Claude Code for hooks to take effect.**

### Option B: Manual Configuration

If you prefer to configure hooks manually:

**Step 1:** Run setup first to install the hook binary/script:
```bash
npx vibecraft setup
```

**Step 2:** Get your installed hook path:
```bash
npx vibecraft --hook-path
# Returns: ~/.vibecraft/hooks/vibecraft-hook (Rust) or
#          ~/.vibecraft/hooks/vibecraft-hook.sh (Bash)
```

**Step 3:** Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "*", "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "PostToolUse": [
      { "matcher": "*", "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "Stop": [
      { "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "SubagentStop": [
      { "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "SessionStart": [
      { "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "SessionEnd": [
      { "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ],
    "Notification": [
      { "hooks": [{"type": "command", "command": "HOOK_PATH", "timeout": 5}] }
    ]
  }
}
```

Replace `HOOK_PATH` with the output from step 2.

**Hook Types:**
- **Rust binary** (`~/.vibecraft/hooks/vibecraft-hook`): 7-10x faster, no jq required, requires curl for real-time notifications
- **Bash script** (`~/.vibecraft/hooks/vibecraft-hook.sh`): Fallback for unsupported platforms, requires jq and curl

---

## What "Agent Not Connected" Means

If you see this overlay in the browser:

```
┌──────────────────────────────────┐
│                                  │
│     🔌 Agent Not Connected       │
│                                  │
│  Vibecraft needs a local agent   │
│  running to receive events.      │
│                                  │
│       [ npx vibecraft ]          │
│                                  │
└──────────────────────────────────┘
```

**It means ONE of these:**

| Problem | Solution |
|---------|----------|
| Server not running | Run `npx vibecraft` in a terminal |
| Wrong port | Check URL matches server port (default: 4003) |
| Hooks not configured | Run `npx vibecraft setup` |

**Quick test:**
```bash
# Check server is running
curl http://localhost:4003/health
# Should return: {"ok":true,...}
```

---

## Sending Prompts from Browser

To send prompts to Claude from the Vibecraft UI:

### Step 1: Run Claude in tmux

```bash
# Create named tmux session
tmux new -s claude

# Start Claude inside tmux
claude
```

### Step 2: Use Vibecraft normally

```bash
# In another terminal
npx vibecraft
```

### Step 3: Send prompts

In the browser, type in the prompt field and click "Send" with "Send to tmux" checked.

**Note:** If you named your tmux session something other than `claude`:
```bash
VIBECRAFT_TMUX_SESSION=myname npx vibecraft
```

---

## Common Issues

### "jq: command not found"

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq

# Arch
pacman -S jq
```

### "Permission denied" on hook script

```bash
chmod +x $(npx vibecraft --hook-path)
```

### Events not appearing

**1. Check server is running:**
```bash
curl http://localhost:4003/health
```

**2. Check hooks are configured:**
```bash
cat ~/.claude/settings.json | grep vibecraft
```

**3. Restart Claude Code** (hooks load at startup)

### "Can't connect to tmux session"

```bash
# List sessions
tmux list-sessions

# Default session name is 'claude'
# If different, set environment variable:
VIBECRAFT_TMUX_SESSION=yourname npx vibecraft
```

### Events appearing twice

You likely have duplicate hooks configured. Check `~/.claude/settings.json` for duplicate vibecraft-hook entries and remove extras. Then run `npx vibecraft setup` to ensure correct configuration.

### Browser shows "Disconnected"

- Refresh the page
- Check if server is still running
- Check browser console for errors

---

## Voice Input (Optional)

For speech-to-text prompts:

1. Sign up at [deepgram.com](https://deepgram.com)
2. Create an API key
3. Add to your `.env` file:
   ```bash
   DEEPGRAM_API_KEY=your_api_key_here
   ```
4. Restart the server
5. Press `Alt+S` or click the microphone icon

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBECRAFT_PORT` | `4003` | Server port |
| `VIBECRAFT_TMUX_SESSION` | `claude` | tmux session for prompts |
| `VIBECRAFT_DEBUG` | `false` | Verbose logging |
| `DEEPGRAM_API_KEY` | (none) | Deepgram API key for voice input |

Example:
```bash
VIBECRAFT_PORT=4005 VIBECRAFT_DEBUG=true npx vibecraft
```

---

## Development Setup

For contributing or modifying:

```bash
# Clone
git clone https://github.com/nearcyan/vibecraft
cd vibecraft

# Install dependencies
npm install

# Start dev servers (frontend :4002, API :4003)
npm run dev

# Open browser
open http://localhost:4002
```

**Note:** In dev mode, frontend and API run on different ports. In production (`npx vibecraft`), everything runs on port 4003.

---

## Uninstalling

To remove Vibecraft hooks (keeps your event data):

```bash
npx vibecraft uninstall
```

This:
- Removes vibecraft hooks from `~/.claude/settings.json`
- Removes the hook script from `~/.vibecraft/hooks/`
- **Keeps** your data in `~/.vibecraft/data/`
- Does NOT affect other hooks you may have configured

To completely remove all data:

```bash
rm -rf ~/.vibecraft
```

**Restart Claude Code after uninstalling for changes to take effect.**

---

## Getting Help

- **GitHub Issues:** https://github.com/nearcyan/vibecraft/issues
- **Technical Docs:** See [CLAUDE.md](../CLAUDE.md)
- **Orchestration:** See [ORCHESTRATION.md](./ORCHESTRATION.md)
