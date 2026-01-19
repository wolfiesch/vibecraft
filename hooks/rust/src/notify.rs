//! HTTP notification to the Vibecraft WebSocket server.
//!
//! This module handles real-time event delivery to the Vibecraft visualization
//! server. Events are POSTed via HTTP to allow the browser client to receive
//! immediate updates.
//!
//! # Architecture
//!
//! ```text
//! Rust Hook ─────POST─────▶ WebSocket Server ─────WS─────▶ Browser
//!              /event              │
//!                                  ▼
//!                           Broadcast to clients
//! ```
//!
//! # Design Choices
//!
//! **Fire-and-forget child process**: The HTTP POST is performed by spawning
//! a detached `curl` child process. This is important because:
//!
//! 1. Hook latency directly affects Claude Code responsiveness
//! 2. Server may be down/slow - we don't want to block on that
//! 3. Events are also written to JSONL, so HTTP delivery is optional
//! 4. Child processes survive after the parent exits (unlike threads)
//!
//! **Why curl instead of ureq?** While ureq would be faster, threads die when
//! main() exits. Bash's `curl &` creates a child *process* that survives parent
//! exit. Using `Command::spawn()` with curl achieves the same behavior.
//!
//! **Short timeout**: 2-second curl timeout (-m 2) ensures the child doesn't
//! hang indefinitely if the server is unresponsive.
//!
//! **PATH bootstrapping**: curl may not be in PATH in minimal environments.
//! We search common locations (Homebrew, system bins) to find it.

use serde::Serialize;
use std::path::Path;
use std::process::{Command, Stdio};

/// Default WebSocket server endpoint for event notifications.
const DEFAULT_URL: &str = "http://localhost:4003/event";

/// HTTP request timeout in seconds.
///
/// Short timeout (2s) ensures we don't block too long
/// if the server is slow or unresponsive.
const TIMEOUT_SECS: u64 = 2;

/// Common tool locations for cross-platform discovery.
///
/// These paths cover:
/// - macOS Apple Silicon Homebrew: /opt/homebrew/bin
/// - macOS Intel Homebrew / Linux local: /usr/local/bin
/// - System binaries: /usr/bin, /bin
const KNOWN_PATHS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
];

/// Attempts to spawn curl with the given arguments.
///
/// Returns true if spawn succeeded, false otherwise.
fn try_spawn_curl(curl_cmd: &str, args: &[&str]) -> bool {
    Command::new(curl_cmd)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .is_ok()
}

/// Sends an event to the WebSocket server asynchronously.
///
/// The HTTP POST is performed by spawning a detached `curl` child process.
/// This is fire-and-forget - the child process runs independently and survives
/// after main() exits (unlike threads). Errors are silently ignored since
/// the event is also persisted to the JSONL file.
///
/// # Arguments
///
/// * `event` - Any serializable event to send
/// * `url` - Optional custom endpoint URL (defaults to `localhost:4003/event`)
///
/// # Implementation Notes
///
/// Uses `curl` command instead of ureq library because:
/// - `thread::spawn()` creates threads that die when main() exits
/// - `Command::spawn()` creates child processes that survive parent exit
/// - This matches bash hook's `curl ... &` behavior
///
/// # Performance
///
/// Tries `curl` directly first (single spawn). Only searches known paths
/// if that fails, avoiding the overhead of running `curl --version` every event.
///
/// # Example
///
/// ```ignore
/// notify_server(my_event, Some("http://custom:8080/event"));
/// // Child process spawned, function returns immediately
/// ```
pub fn notify_server<T: Serialize>(event: T, url: Option<&str>) {
    let url = url.unwrap_or(DEFAULT_URL);

    let body = match serde_json::to_string(&event) {
        Ok(b) => b,
        Err(_) => return,
    };

    let timeout_str = TIMEOUT_SECS.to_string();
    let args: Vec<&str> = vec![
        "-s",                          // Silent mode
        "-X", "POST",                  // HTTP POST
        "-H", "Content-Type: application/json",
        "-d", &body,                   // Request body
        "-m", &timeout_str,            // Timeout in seconds
        url,
    ];

    // Try `curl` directly first (common case: curl is in PATH)
    if try_spawn_curl("curl", &args) {
        return;
    }

    // Fallback: search known paths (for minimal environments without PATH)
    for dir in KNOWN_PATHS {
        let curl_path = format!("{}/curl", dir);
        if Path::new(&curl_path).exists() && try_spawn_curl(&curl_path, &args) {
            return;
        }
    }

    // Silently fail if curl not found (events are persisted to JSONL anyway)
}

/// Checks if WebSocket notifications are enabled.
///
/// Notifications can be disabled by setting `VIBECRAFT_ENABLE_WS_NOTIFY=false`.
/// Any other value (including unset) means notifications are enabled.
///
/// # Returns
///
/// `true` if notifications should be sent, `false` otherwise.
///
/// # Environment Variable
///
/// `VIBECRAFT_ENABLE_WS_NOTIFY`:
/// - Not set → enabled (default)
/// - `"false"` (case-insensitive) → disabled
/// - Any other value → enabled
pub fn is_notify_enabled() -> bool {
    std::env::var("VIBECRAFT_ENABLE_WS_NOTIFY")
        .map(|v| v.to_lowercase() != "false")
        .unwrap_or(true)
}

/// Returns the WebSocket notification endpoint URL.
///
/// Reads from `VIBECRAFT_WS_NOTIFY` environment variable, falling back
/// to `http://localhost:4003/event` if not set.
///
/// # Returns
///
/// The URL to POST events to.
///
/// # Environment Variable
///
/// `VIBECRAFT_WS_NOTIFY`:
/// - Not set → `http://localhost:4003/event`
/// - Set → use the provided value
pub fn get_notify_url() -> String {
    std::env::var("VIBECRAFT_WS_NOTIFY").unwrap_or_else(|_| DEFAULT_URL.to_string())
}
