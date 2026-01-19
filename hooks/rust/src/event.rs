//! Event type definitions for Vibecraft.
//!
//! This module defines the data structures for Claude Code hook input and
//! the transformed Vibecraft event output. These types mirror the TypeScript
//! definitions in `shared/types.ts` to ensure consistent event handling
//! between the Rust hook and the Node.js server.
//!
//! # Input vs Output
//!
//! - **HookInput**: Raw JSON from Claude Code hooks (PascalCase field names)
//! - **VibecraftEvent**: Transformed events for visualization (camelCase fields)
//!
//! # Event Types
//!
//! | Hook Event | Vibecraft Type | Description |
//! |------------|---------------|-------------|
//! | PreToolUse | pre_tool_use | Before a tool executes |
//! | PostToolUse | post_tool_use | After tool completion |
//! | Stop | stop | Claude stops responding |
//! | SubagentStop | subagent_stop | Subagent task completes |
//! | SessionStart | session_start | New session begins |
//! | SessionEnd | session_end | Session terminates |
//! | UserPromptSubmit | user_prompt_submit | User sends a prompt |
//! | Notification | notification | System notification |
//! | PreCompact | pre_compact | Context compaction begins |

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Default value for unknown/missing string fields.
fn default_unknown() -> String {
    "unknown".to_string()
}

/// Raw input from Claude Code hooks.
///
/// This struct deserializes the JSON that Claude Code pipes to stdin when
/// a hook event fires. Field names match Claude Code's output format.
///
/// # Required Fields (with defaults for robustness)
///
/// - `hook_event_name`: The event type (PascalCase, e.g., "PreToolUse") - defaults to "unknown"
/// - `session_id`: Unique identifier for the Claude session - defaults to "unknown"
/// - `cwd`: Current working directory - defaults to empty string
///
/// **Note:** Fields have defaults to match bash hook behavior. Malformed input
/// will produce events with "unknown" values rather than failing completely.
/// This allows partial events to be recorded for debugging.
///
/// # Optional Fields
///
/// Different event types include different optional fields. For example,
/// tool events include `tool_name` and `tool_input`, while stop events
/// include `stop_hook_active`.
///
/// # Example
///
/// ```json
/// {
///   "hook_event_name": "PreToolUse",
///   "session_id": "abc-123",
///   "cwd": "/home/user/project",
///   "tool_name": "Read",
///   "tool_input": {"file_path": "/path/to/file.txt"},
///   "tool_use_id": "toolu_01ABC"
/// }
/// ```
#[derive(Debug, Deserialize)]
pub struct HookInput {
    #[serde(default = "default_unknown")]
    pub hook_event_name: String,
    #[serde(default = "default_unknown")]
    pub session_id: String,
    #[serde(default)]
    pub cwd: String,

    // Tool events
    #[serde(default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub tool_input: Option<Value>,
    #[serde(default)]
    pub tool_use_id: Option<String>,
    #[serde(default)]
    pub tool_response: Option<Value>,
    #[serde(default)]
    pub transcript_path: Option<String>,

    // Stop events
    #[serde(default)]
    pub stop_hook_active: Option<bool>,

    // Session events
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,

    // User prompt
    #[serde(default)]
    pub prompt: Option<String>,

    // Notification
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub notification_type: Option<String>,

    // Pre-compact
    #[serde(default)]
    pub trigger: Option<String>,
    #[serde(default)]
    pub custom_instructions: Option<String>,
}

/// Transformed event for the Vibecraft visualization system.
///
/// This enum represents the output format written to the events JSONL file
/// and sent to the WebSocket server. Each variant corresponds to a different
/// event type from Claude Code.
///
/// # Serialization
///
/// Events are serialized as untagged JSON, meaning the `type` field inside
/// the struct determines the event type (not an external tag). Field names
/// use camelCase to match the TypeScript frontend expectations.
///
/// # Common Fields
///
/// All variants include:
/// - `id`: Unique event identifier (`{sessionId}-{timestamp}-{random}`)
/// - `timestamp`: Unix timestamp in milliseconds
/// - `type`: Event type string (snake_case)
/// - `sessionId`: Claude session identifier
/// - `cwd`: Current working directory
///
/// # Example Output
///
/// ```json
/// {
///   "id": "abc-123-1705123456789-42",
///   "timestamp": 1705123456789,
///   "type": "pre_tool_use",
///   "sessionId": "abc-123",
///   "cwd": "/home/user/project",
///   "tool": "Read",
///   "toolInput": {"file_path": "/path/to/file.txt"},
///   "toolUseId": "toolu_01ABC",
///   "assistantText": ""
/// }
/// ```
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum VibecraftEvent {
    PreToolUse {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        tool: String,
        #[serde(rename = "toolInput")]
        tool_input: Value,
        #[serde(rename = "toolUseId")]
        tool_use_id: String,
        #[serde(rename = "assistantText")]
        assistant_text: String,
    },
    PostToolUse {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        tool: String,
        #[serde(rename = "toolInput")]
        tool_input: Value,
        #[serde(rename = "toolResponse")]
        tool_response: Value,
        #[serde(rename = "toolUseId")]
        tool_use_id: String,
        success: bool,
    },
    Stop {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        #[serde(rename = "stopHookActive")]
        stop_hook_active: bool,
        response: String,
    },
    SubagentStop {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        #[serde(rename = "stopHookActive")]
        stop_hook_active: bool,
    },
    SessionStart {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        source: String,
    },
    SessionEnd {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        reason: String,
    },
    UserPromptSubmit {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        prompt: String,
    },
    Notification {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        message: String,
        #[serde(rename = "notificationType")]
        notification_type: String,
    },
    PreCompact {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        trigger: String,
        #[serde(rename = "customInstructions")]
        custom_instructions: String,
    },
    Unknown {
        id: String,
        timestamp: i64,
        #[serde(rename = "type")]
        event_type: String,
        #[serde(rename = "sessionId")]
        session_id: String,
        cwd: String,
        raw: Value,
    },
}
