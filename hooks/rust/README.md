# Vibecraft Rust Hook

High-performance Claude Code event processor written in Rust. Provides **7-10x faster** event processing compared to the bash hook script.

## Performance

| Metric | Bash | Rust | Improvement |
|--------|------|------|-------------|
| Mean latency | ~30-37ms | ~3-4ms | **~10x faster** |
| User CPU time | ~15-16ms | ~2ms | **~8x less** |
| System time | ~17-18ms | ~2ms | **~9x less** |

See [../BENCHMARK.md](../BENCHMARK.md) for detailed benchmark results and methodology.

## Architecture

```
Claude Code → stdin JSON → Rust Hook → events.jsonl
                                    → HTTP POST → WebSocket Server
```

### Modules

| Module | Purpose |
|--------|---------|
| `main.rs` | Entry point, file I/O, error handling |
| `event.rs` | Type definitions for input/output events |
| `transform.rs` | Event transformation logic |
| `notify.rs` | HTTP notification to WebSocket server |

### Data Flow

1. **Input**: Claude Code pipes hook JSON to stdin
2. **Parse**: Deserialize with `serde_json` into `HookInput`
3. **Transform**: Convert to `VibecraftEvent` with proper field mapping
4. **Output**: Append to JSONL file + POST to WebSocket server

## Building

### Prerequisites

- Rust 1.70+ (`rustup` recommended)
- For cross-compilation: platform-specific toolchains

### Development Build

```bash
cd hooks/rust
cargo build
```

### Release Build

```bash
cargo build --release
# Binary at: target/release/vibecraft-hook
```

### Cross-Compilation

Build binaries for all macOS architectures:

```bash
./build-all.sh
```

Produces:
- `../bin/vibecraft-hook-darwin-arm64` (Apple Silicon)
- `../bin/vibecraft-hook-darwin-x64` (Intel)
- `../bin/vibecraft-hook-darwin-universal` (Fat binary)

## Testing

### Unit Tests

```bash
cargo test
```

### Integration Tests

```bash
cd hooks
./benchmark/test-hooks.sh
```

This validates:
- JSON output structure
- Required fields presence
- Event type mapping
- Error handling
- Environment variable overrides
- Parity with bash hook output

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VIBECRAFT_DATA_DIR` | `~/.vibecraft/data` | Data directory path |
| `VIBECRAFT_EVENTS_FILE` | `{data_dir}/events.jsonl` | Events log path |
| `VIBECRAFT_ENABLE_WS_NOTIFY` | `true` | Enable WebSocket notifications |
| `VIBECRAFT_WS_NOTIFY` | `http://localhost:4003/event` | WebSocket endpoint URL |

## Event Types

The hook transforms these Claude Code events:

| Hook Event | Output Type | Key Fields |
|------------|-------------|------------|
| PreToolUse | `pre_tool_use` | tool, toolInput, toolUseId, assistantText |
| PostToolUse | `post_tool_use` | tool, toolInput, toolResponse, success |
| Stop | `stop` | stopHookActive, response |
| SubagentStop | `subagent_stop` | stopHookActive |
| SessionStart | `session_start` | source |
| SessionEnd | `session_end` | reason |
| UserPromptSubmit | `user_prompt_submit` | prompt |
| Notification | `notification` | message, notificationType |
| PreCompact | `pre_compact` | trigger, customInstructions |

## Why Rust?

The bash hook's overhead comes from:

1. **Multiple `jq` invocations** (~15 per event) - Each spawns a new process
2. **Shell process spawning** - Bash forks for subshells and pipes
3. **Tool discovery** - Finding `jq`, `curl` in PATH each time
4. **Timestamp generation** - Uses Perl/Python for millisecond precision on macOS

The Rust hook eliminates all of these:

1. **Single binary** - No process spawning for JSON parsing
2. **serde_json** - Zero-allocation JSON parsing in-process
3. **Compiled** - No interpreter startup time
4. **Static linking** - Minimal dynamic library loading

## Dependencies

```toml
[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
ureq = "2.9"           # HTTP client
chrono = "0.4"         # Timestamps
rand = "0.8"           # Event ID generation
dirs = "5.0"           # Home directory resolution
```

## License

MIT - Same as the main Vibecraft project.
