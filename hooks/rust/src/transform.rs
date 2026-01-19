//! Transform Claude Code hook input into Vibecraft events.
//!
//! This module handles the core transformation logic that converts raw hook
//! input from Claude Code into the Vibecraft event format. The transformation
//! includes:
//!
//! - Event type mapping (PascalCase → snake_case)
//! - Unique ID generation
//! - Timestamp assignment
//! - Field extraction and renaming
//! - Transcript parsing for assistant text/responses
//!
//! # Transformation Pipeline
//!
//! ```text
//! HookInput (stdin JSON)
//!     │
//!     ▼
//! Parse & validate
//!     │
//!     ▼
//! Map event type
//!     │
//!     ▼
//! Generate ID & timestamp
//!     │
//!     ▼
//! Extract event-specific fields
//!     │
//!     ▼
//! VibecraftEvent (output)
//! ```
//!
//! # Performance
//!
//! Transcript reading uses a seek-from-end strategy to avoid O(n) full-file
//! reads on large transcripts. We read chunks from the end and expand as needed.

use crate::event::{HookInput, VibecraftEvent};
use chrono::Utc;
use rand::Rng;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};

/// Generates a unique event identifier.
///
/// The ID format is `{session_id}-{timestamp}-{random}`, which ensures
/// uniqueness across sessions and provides temporal ordering information.
///
/// # Arguments
///
/// * `session_id` - The Claude session identifier
/// * `timestamp` - Unix timestamp in milliseconds
///
/// # Returns
///
/// A unique string identifier for the event.
///
/// # Example
///
/// ```ignore
/// let id = generate_event_id("abc-123", 1705123456789);
/// // Returns something like "abc-123-1705123456789-42"
/// ```
fn generate_event_id(session_id: &str, timestamp: i64) -> String {
    let random: u32 = rand::thread_rng().gen();
    format!("{}-{}-{}", session_id, timestamp, random)
}

/// Returns the current UTC timestamp in milliseconds.
///
/// Used for event timestamping to ensure consistent time tracking
/// across the visualization system.
fn get_timestamp_ms() -> i64 {
    Utc::now().timestamp_millis()
}

/// Maps Claude Code hook event names to Vibecraft event types.
///
/// Converts from PascalCase (Claude Code format) to snake_case
/// (Vibecraft format) for consistency with the TypeScript frontend.
///
/// # Arguments
///
/// * `hook_event_name` - The event name from Claude Code (e.g., "PreToolUse")
///
/// # Returns
///
/// The corresponding snake_case event type string.
///
/// # Mappings
///
/// | Input | Output |
/// |-------|--------|
/// | PreToolUse | pre_tool_use |
/// | PostToolUse | post_tool_use |
/// | Stop | stop |
/// | SubagentStop | subagent_stop |
/// | SessionStart | session_start |
/// | SessionEnd | session_end |
/// | UserPromptSubmit | user_prompt_submit |
/// | Notification | notification |
/// | PreCompact | pre_compact |
/// | (unknown) | unknown |
fn map_event_type(hook_event_name: &str) -> &'static str {
    match hook_event_name {
        "PreToolUse" => "pre_tool_use",
        "PostToolUse" => "post_tool_use",
        "Stop" => "stop",
        "SubagentStop" => "subagent_stop",
        "SessionStart" => "session_start",
        "SessionEnd" => "session_end",
        "UserPromptSubmit" => "user_prompt_submit",
        "Notification" => "notification",
        "PreCompact" => "pre_compact",
        _ => "unknown",
    }
}

/// Reads the last N lines from a file using seek-from-end strategy.
///
/// This avoids O(n) full-file reads on large transcripts by:
/// 1. Seeking to the end minus a chunk size
/// 2. Reading from there to EOF
/// 3. Expanding chunk size if we don't have enough lines
///
/// # Arguments
///
/// * `path` - Path to the file to read
/// * `n` - Number of lines to read from the end
///
/// # Returns
///
/// Up to the last N lines from the file. May return fewer if file is small.
///
/// # Performance
///
/// Initial chunk: 8KB (covers ~100-200 lines of typical JSONL)
/// Doubles chunk size if more lines needed, up to file size.
fn read_last_n_lines(path: &str, n: usize) -> Vec<String> {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let file_size = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return Vec::new(),
    };

    if file_size == 0 {
        return Vec::new();
    }

    let mut reader = BufReader::new(file);
    let mut chunk_size: u64 = 8192; // Start with 8KB
    let mut lines = Vec::new();

    loop {
        let start_pos = file_size.saturating_sub(chunk_size);
        if reader.seek(SeekFrom::Start(start_pos)).is_err() {
            break;
        }

        // If we're not at file start, skip partial first line
        if start_pos > 0 {
            let mut partial = String::new();
            let _ = reader.read_line(&mut partial);
        }

        // Read remaining lines
        lines.clear();
        for line in reader.by_ref().lines() {
            if let Ok(l) = line {
                lines.push(l);
            }
        }

        // If we have enough lines or already read entire file, we're done
        if lines.len() >= n || chunk_size >= file_size {
            break;
        }

        // Double chunk size and try again
        chunk_size = chunk_size.saturating_mul(2).min(file_size);
    }

    // Return only the last n lines
    if lines.len() > n {
        lines.split_off(lines.len() - n)
    } else {
        lines
    }
}

/// Extracts assistant text from the transcript for pre_tool_use events.
///
/// Reads the Claude session transcript file and extracts text content from
/// assistant messages that appear after the last user message. This provides
/// context about what Claude was saying when invoking a tool.
///
/// # Arguments
///
/// * `transcript_path` - Optional path to the session transcript JSONL file
///
/// # Returns
///
/// The concatenated assistant text, or an empty string if unavailable.
///
/// # Implementation Notes
///
/// - Reads the last 30 lines of the transcript for efficiency (using seek-from-end)
/// - Finds the most recent user message as a boundary
/// - Collects text content from assistant messages after that boundary
/// - Returns empty string on any error (file not found, parse error, etc.)
fn extract_assistant_text(transcript_path: &Option<String>) -> String {
    let path = match transcript_path {
        Some(p) if !p.is_empty() => p,
        _ => return String::new(),
    };

    // Use optimized seek-from-end reader instead of reading entire file
    let recent_lines = read_last_n_lines(path, 30);

    // Find last user message index
    let mut last_user_idx: Option<usize> = None;
    for (i, line) in recent_lines.iter().enumerate() {
        if let Ok(obj) = serde_json::from_str::<Value>(line) {
            if obj.get("type").and_then(|t| t.as_str()) == Some("user") {
                last_user_idx = Some(i);
            }
        }
    }

    // Collect assistant text after last user message
    let start_idx = last_user_idx.map(|i| i + 1).unwrap_or(0);
    let mut assistant_texts: Vec<String> = Vec::new();

    for line in &recent_lines[start_idx..] {
        if let Ok(obj) = serde_json::from_str::<Value>(line) {
            if obj.get("type").and_then(|t| t.as_str()) == Some("assistant") {
                if let Some(content) = obj.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                assistant_texts.push(text.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    assistant_texts.join("\n")
}

/// Extracts Claude's final response from the transcript for stop events.
///
/// When Claude stops responding, this function extracts the last assistant
/// message text from the transcript. This allows the visualization to show
/// what Claude's final response was.
///
/// # Arguments
///
/// * `transcript_path` - Optional path to the session transcript JSONL file
///
/// # Returns
///
/// The last assistant response text, or an empty string if unavailable.
///
/// # Implementation Notes
///
/// - Reads the last 200 lines of the transcript (using seek-from-end for efficiency)
/// - Finds the most recent assistant message with text content
/// - Returns the last such message found (there may be multiple assistant turns)
fn extract_assistant_response(transcript_path: &Option<String>) -> String {
    let path = match transcript_path {
        Some(p) if !p.is_empty() => p,
        _ => return String::new(),
    };

    // Use optimized seek-from-end reader instead of reading entire file
    let recent_lines = read_last_n_lines(path, 200);

    // Find last assistant message with text content
    let mut last_assistant_text: Option<String> = None;

    for line in &recent_lines {
        if let Ok(obj) = serde_json::from_str::<Value>(line) {
            if obj.get("type").and_then(|t| t.as_str()) == Some("assistant") {
                if let Some(content) = obj.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
                    let texts: Vec<String> = content
                        .iter()
                        .filter(|item| item.get("type").and_then(|t| t.as_str()) == Some("text"))
                        .filter_map(|item| item.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
                        .collect();
                    if !texts.is_empty() {
                        last_assistant_text = Some(texts.join("\n"));
                    }
                }
            }
        }
    }

    last_assistant_text.unwrap_or_default()
}

/// Transforms Claude Code hook input into a Vibecraft event.
///
/// This is the main entry point for event transformation. It takes the parsed
/// hook input and produces a properly formatted `VibecraftEvent` for output.
///
/// # Arguments
///
/// * `input` - Parsed hook input from Claude Code
/// * `raw_input` - Original JSON value (used for unknown event fallback)
///
/// # Returns
///
/// A `VibecraftEvent` variant matching the input event type.
///
/// # Event Type Handling
///
/// Each event type extracts different fields:
///
/// - **pre_tool_use**: tool name, input, ID, assistant text from transcript
/// - **post_tool_use**: tool name, input, response, success status
/// - **stop**: stop_hook_active flag, final response from transcript
/// - **subagent_stop**: stop_hook_active flag
/// - **session_start**: source (startup, resume, etc.)
/// - **session_end**: reason (user_exit, error, etc.)
/// - **user_prompt_submit**: user's prompt text
/// - **notification**: message text, notification type
/// - **pre_compact**: trigger type, custom instructions
/// - **unknown**: preserves raw JSON for debugging
///
/// # Example
///
/// ```ignore
/// let input: HookInput = serde_json::from_str(json_str)?;
/// let raw: Value = serde_json::from_str(json_str)?;
/// let event = transform(input, raw);
/// ```
pub fn transform(input: HookInput, raw_input: Value) -> VibecraftEvent {
    let timestamp = get_timestamp_ms();
    let event_id = generate_event_id(&input.session_id, timestamp);
    let event_type = map_event_type(&input.hook_event_name);

    match event_type {
        "pre_tool_use" => VibecraftEvent::PreToolUse {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            tool: input.tool_name.unwrap_or_else(|| "unknown".to_string()),
            tool_input: input.tool_input.unwrap_or(json!({})),
            tool_use_id: input.tool_use_id.unwrap_or_default(),
            assistant_text: extract_assistant_text(&input.transcript_path),
        },

        "post_tool_use" => {
            let tool_response = input.tool_response.clone().unwrap_or(json!({}));
            let success = tool_response
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            VibecraftEvent::PostToolUse {
                id: event_id,
                timestamp,
                event_type: event_type.to_string(),
                session_id: input.session_id,
                cwd: input.cwd,
                tool: input.tool_name.unwrap_or_else(|| "unknown".to_string()),
                tool_input: input.tool_input.unwrap_or(json!({})),
                tool_response,
                tool_use_id: input.tool_use_id.unwrap_or_default(),
                success,
            }
        }

        "stop" => VibecraftEvent::Stop {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            stop_hook_active: input.stop_hook_active.unwrap_or(false),
            response: extract_assistant_response(&input.transcript_path),
        },

        "subagent_stop" => VibecraftEvent::SubagentStop {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            stop_hook_active: input.stop_hook_active.unwrap_or(false),
        },

        "session_start" => VibecraftEvent::SessionStart {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            source: input.source.unwrap_or_else(|| "startup".to_string()),
        },

        "session_end" => VibecraftEvent::SessionEnd {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            reason: input.reason.unwrap_or_else(|| "other".to_string()),
        },

        "user_prompt_submit" => VibecraftEvent::UserPromptSubmit {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            prompt: input.prompt.unwrap_or_default(),
        },

        "notification" => VibecraftEvent::Notification {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            message: input.message.unwrap_or_default(),
            notification_type: input.notification_type.unwrap_or_else(|| "unknown".to_string()),
        },

        "pre_compact" => VibecraftEvent::PreCompact {
            id: event_id,
            timestamp,
            event_type: event_type.to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            trigger: input.trigger.unwrap_or_else(|| "manual".to_string()),
            custom_instructions: input.custom_instructions.unwrap_or_default(),
        },

        _ => VibecraftEvent::Unknown {
            id: event_id,
            timestamp,
            event_type: "unknown".to_string(),
            session_id: input.session_id,
            cwd: input.cwd,
            raw: raw_input,
        },
    }
}
