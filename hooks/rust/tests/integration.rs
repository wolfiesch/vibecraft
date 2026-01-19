//! Integration tests for the Vibecraft hook.
//!
//! These tests validate the transformation of Claude Code hook input
//! into Vibecraft events, ensuring correct field mapping and JSON structure.
//!
//! Unlike the previous tests that only validated input structure, these tests
//! exercise the REAL transform function and verify the output.

use serde_json::json;
use vibecraft_hook::event::HookInput;
use vibecraft_hook::transform::transform;

/// Test pre_tool_use event transformation with real transform function
#[test]
fn test_pre_tool_use_transformation() {
    let input_json = json!({
        "hook_event_name": "PreToolUse",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "tool_name": "Read",
        "tool_input": {"file_path": "/test/file.txt"},
        "tool_use_id": "toolu_123"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    // Verify output structure
    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "pre_tool_use");
    assert_eq!(output["sessionId"], "test-session-123");
    assert_eq!(output["cwd"], "/test/path");
    assert_eq!(output["tool"], "Read");
    assert_eq!(output["toolUseId"], "toolu_123");

    // Verify id contains session_id and has timestamp component
    let id = output["id"].as_str().unwrap();
    assert!(id.starts_with("test-session-123-"), "ID should start with session_id");

    // Verify timestamp is present and reasonable (within last second)
    let timestamp = output["timestamp"].as_i64().unwrap();
    let now = chrono::Utc::now().timestamp_millis();
    assert!(timestamp <= now && timestamp > now - 1000, "Timestamp should be recent");
}

/// Test post_tool_use event transformation
#[test]
fn test_post_tool_use_transformation() {
    let input_json = json!({
        "hook_event_name": "PostToolUse",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "tool_name": "Edit",
        "tool_input": {"file_path": "/test/file.txt"},
        "tool_use_id": "toolu_456",
        "tool_response": {
            "success": true,
            "content": "File edited successfully"
        }
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "post_tool_use");
    assert_eq!(output["tool"], "Edit");
    assert_eq!(output["success"], true);
    assert!(output["toolResponse"].is_object());
}

/// Test post_tool_use with failure response
#[test]
fn test_post_tool_use_failure() {
    let input_json = json!({
        "hook_event_name": "PostToolUse",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "tool_name": "Bash",
        "tool_input": {"command": "invalid_command"},
        "tool_use_id": "toolu_789",
        "tool_response": {
            "success": false,
            "error": "Command not found"
        }
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "post_tool_use");
    assert_eq!(output["success"], false);
}

/// Test stop event transformation
#[test]
fn test_stop_event_transformation() {
    let input_json = json!({
        "hook_event_name": "Stop",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "stop_hook_active": false
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "stop");
    assert_eq!(output["stopHookActive"], false);
}

/// Test session_start event transformation
#[test]
fn test_session_start_transformation() {
    let input_json = json!({
        "hook_event_name": "SessionStart",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "source": "startup"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "session_start");
    assert_eq!(output["source"], "startup");
}

/// Test session_end event transformation
#[test]
fn test_session_end_transformation() {
    let input_json = json!({
        "hook_event_name": "SessionEnd",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "reason": "user_exit"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "session_end");
    assert_eq!(output["reason"], "user_exit");
}

/// Test user_prompt_submit event transformation
#[test]
fn test_user_prompt_submit_transformation() {
    let input_json = json!({
        "hook_event_name": "UserPromptSubmit",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "prompt": "Help me fix this bug"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "user_prompt_submit");
    assert_eq!(output["prompt"], "Help me fix this bug");
}

/// Test notification event transformation
#[test]
fn test_notification_transformation() {
    let input_json = json!({
        "hook_event_name": "Notification",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "message": "Permission required",
        "notification_type": "permission"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "notification");
    assert_eq!(output["message"], "Permission required");
    assert_eq!(output["notificationType"], "permission");
}

/// Test subagent_stop event transformation
#[test]
fn test_subagent_stop_transformation() {
    let input_json = json!({
        "hook_event_name": "SubagentStop",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "stop_hook_active": false
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "subagent_stop");
}

/// Test pre_compact event transformation
#[test]
fn test_pre_compact_transformation() {
    let input_json = json!({
        "hook_event_name": "PreCompact",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "trigger": "auto",
        "custom_instructions": "Focus on the main task"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "pre_compact");
    assert_eq!(output["trigger"], "auto");
}

/// Test unknown event type transformation
#[test]
fn test_unknown_event_transformation() {
    let input_json = json!({
        "hook_event_name": "SomeNewEventType",
        "session_id": "test-session-123",
        "cwd": "/test/path"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json.clone());

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "unknown");
    // Unknown events should preserve raw input
    assert!(output["raw"].is_object());
}

/// Test handling of missing optional fields (defaults)
#[test]
fn test_missing_optional_fields_with_defaults() {
    // Minimal valid input - tests serde defaults
    let input_json = json!({
        "hook_event_name": "PreToolUse",
        "session_id": "test-session-123",
        "cwd": "/test/path"
        // Missing: tool_name, tool_input, tool_use_id
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["type"], "pre_tool_use");
    // Missing tool_name should default to "unknown"
    assert_eq!(output["tool"], "unknown");
    // Missing tool_use_id should default to empty string
    assert_eq!(output["toolUseId"], "");
}

/// Test malformed input uses defaults (Issue 5 fix)
#[test]
fn test_malformed_input_uses_defaults() {
    // Input missing hook_event_name and session_id - should use defaults
    let input_json = json!({
        "cwd": "/test/path"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json.clone());

    let output = serde_json::to_value(&event).unwrap();

    // Should produce "unknown" type event with defaults
    assert_eq!(output["type"], "unknown");
    assert_eq!(output["sessionId"], "unknown");
}

/// Test complex tool input handling
#[test]
fn test_complex_tool_input() {
    let input_json = json!({
        "hook_event_name": "PreToolUse",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "tool_name": "Task",
        "tool_input": {
            "description": "Research task",
            "prompt": "Find all usages of function X",
            "subagent_type": "Explore",
            "run_in_background": true
        },
        "tool_use_id": "toolu_task_001"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["toolInput"]["subagent_type"], "Explore");
    assert_eq!(output["toolInput"]["run_in_background"], true);
}

/// Test Unicode handling in prompts
#[test]
fn test_unicode_handling() {
    let input_json = json!({
        "hook_event_name": "UserPromptSubmit",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "prompt": "Help me with 😀 emoji and 中文 Chinese"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    let prompt = output["prompt"].as_str().unwrap();
    assert!(prompt.contains('😀'));
    assert!(prompt.contains('中'));
}

/// Test long prompt handling
#[test]
fn test_long_prompt() {
    let long_text = "x".repeat(10000);
    let input_json = json!({
        "hook_event_name": "UserPromptSubmit",
        "session_id": "test-session-123",
        "cwd": "/test/path",
        "prompt": long_text
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert_eq!(output["prompt"].as_str().unwrap().len(), 10000);
}

/// Test special characters in paths
#[test]
fn test_special_path_characters() {
    let input_json = json!({
        "hook_event_name": "PreToolUse",
        "session_id": "test-session-123",
        "cwd": "/Users/test/My Projects/app (v2)/src",
        "tool_name": "Read",
        "tool_input": {"file_path": "/path/with spaces/file name.txt"},
        "tool_use_id": "toolu_123"
    });

    let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
    let event = transform(input, input_json);

    let output = serde_json::to_value(&event).unwrap();

    assert!(output["cwd"].as_str().unwrap().contains(" "));
    assert!(output["toolInput"]["file_path"].as_str().unwrap().contains(" "));
}

/// Test event type mapping from PascalCase to snake_case
#[test]
fn test_all_event_type_mappings() {
    let mappings = vec![
        ("PreToolUse", "pre_tool_use"),
        ("PostToolUse", "post_tool_use"),
        ("Stop", "stop"),
        ("SubagentStop", "subagent_stop"),
        ("SessionStart", "session_start"),
        ("SessionEnd", "session_end"),
        ("UserPromptSubmit", "user_prompt_submit"),
        ("Notification", "notification"),
        ("PreCompact", "pre_compact"),
    ];

    for (pascal_case, expected_snake_case) in mappings {
        let input_json = json!({
            "hook_event_name": pascal_case,
            "session_id": "test",
            "cwd": "/test"
        });

        let input: HookInput = serde_json::from_value(input_json.clone()).unwrap();
        let event = transform(input, input_json);

        let output = serde_json::to_value(&event).unwrap();
        assert_eq!(
            output["type"].as_str().unwrap(),
            expected_snake_case,
            "Failed mapping for {}", pascal_case
        );
    }
}
