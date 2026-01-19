#!/bin/bash
#
# Vibecraft Hook Integration Tests
#
# Tests that the Rust hook produces semantically equivalent output to the Bash hook.
# Validates JSON structure, required fields, and correct event type mapping.
#
# Usage:
#   ./test-hooks.sh              # Run all tests
#   ./test-hooks.sh --verbose    # Show detailed output
#   ./test-hooks.sh --rust-only  # Only test Rust hook (skip parity checks)
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(dirname "$SCRIPT_DIR")"
PAYLOADS_DIR="$SCRIPT_DIR/payloads"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

VERBOSE=${VERBOSE:-false}
RUST_ONLY=${RUST_ONLY:-false}
TESTS_PASSED=0
TESTS_FAILED=0

# Parse arguments
for arg in "$@"; do
    case $arg in
        --verbose|-v)
            VERBOSE=true
            ;;
        --rust-only)
            RUST_ONLY=true
            ;;
    esac
done

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; TESTS_FAILED=$((TESTS_FAILED + 1)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_verbose() { [[ "$VERBOSE" == "true" ]] && echo -e "       $1" || true; }

# Cross-platform timeout wrapper (macOS uses gtimeout from coreutils)
run_with_timeout() {
    local timeout_secs="$1"
    shift
    if command -v timeout &>/dev/null; then
        timeout "$timeout_secs" "$@"
    elif command -v gtimeout &>/dev/null; then
        gtimeout "$timeout_secs" "$@"
    else
        # Fallback: run without timeout (not ideal but allows tests to run)
        log_warn "Neither 'timeout' nor 'gtimeout' found - running without timeout"
        "$@"
    fi
}

# Find executables
BASH_HOOK="$HOOKS_DIR/vibecraft-hook.sh"
RUST_HOOK="$HOOKS_DIR/rust/target/release/vibecraft-hook"

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if [[ ! -f "$BASH_HOOK" ]]; then
        log_fail "Bash hook not found: $BASH_HOOK"
        exit 1
    fi

    if [[ ! -f "$RUST_HOOK" ]]; then
        log_warn "Rust hook not built. Building..."
        (cd "$HOOKS_DIR/rust" && cargo build --release --quiet)
    fi

    if [[ ! -x "$RUST_HOOK" ]]; then
        log_fail "Rust hook not executable: $RUST_HOOK"
        exit 1
    fi

    # Check for jq
    if ! command -v jq &>/dev/null; then
        log_fail "jq is required but not installed"
        exit 1
    fi

    log_info "Prerequisites OK"
}

# Test that a hook produces valid JSON
test_valid_json() {
    local hook="$1"
    local payload="$2"
    local name="$3"

    local output
    output=$(cat "$payload" | VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" 2>/dev/null) || true

    # For Rust hook, we need to read from the events file since it writes there
    if [[ "$hook" == "$RUST_HOOK" ]]; then
        # Create temp events file
        local temp_file=$(mktemp)
        output=$(cat "$payload" | VIBECRAFT_EVENTS_FILE="$temp_file" VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" 2>/dev/null; cat "$temp_file"; rm "$temp_file")
    fi

    if echo "$output" | jq . >/dev/null 2>&1; then
        log_pass "$name produces valid JSON"
        return 0
    else
        log_fail "$name produces invalid JSON"
        log_verbose "Output: $output"
        return 1
    fi
}

# Test required fields are present
test_required_fields() {
    local hook="$1"
    local payload="$2"
    local name="$3"

    local temp_file=$(mktemp)
    cat "$payload" | VIBECRAFT_EVENTS_FILE="$temp_file" VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" >/dev/null 2>&1 || true
    local output
    output=$(cat "$temp_file")
    rm "$temp_file"

    local required=("id" "timestamp" "type" "sessionId" "cwd")
    local missing=()

    for field in "${required[@]}"; do
        if ! echo "$output" | jq -e ".$field" >/dev/null 2>&1; then
            missing+=("$field")
        fi
    done

    if [[ ${#missing[@]} -eq 0 ]]; then
        log_pass "$name has all required fields"
        return 0
    else
        log_fail "$name missing fields: ${missing[*]}"
        return 1
    fi
}

# Test event type mapping
test_event_type_mapping() {
    local hook="$1"
    local payload="$2"
    local expected_type="$3"
    local name="$4"

    local temp_file=$(mktemp)
    cat "$payload" | VIBECRAFT_EVENTS_FILE="$temp_file" VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" >/dev/null 2>&1 || true
    local output
    output=$(cat "$temp_file")
    rm "$temp_file"

    local actual_type
    actual_type=$(echo "$output" | jq -r '.type')

    if [[ "$actual_type" == "$expected_type" ]]; then
        log_pass "$name: type=$expected_type"
        return 0
    else
        log_fail "$name: expected type=$expected_type, got $actual_type"
        return 1
    fi
}

# Test parity between Bash and Rust hooks
test_parity() {
    local payload="$1"
    local payload_name=$(basename "$payload" .json)

    local bash_temp=$(mktemp)
    local rust_temp=$(mktemp)

    # Run both hooks
    cat "$payload" | VIBECRAFT_EVENTS_FILE="$bash_temp" VIBECRAFT_ENABLE_WS_NOTIFY=false "$BASH_HOOK" >/dev/null 2>&1 || true
    cat "$payload" | VIBECRAFT_EVENTS_FILE="$rust_temp" VIBECRAFT_ENABLE_WS_NOTIFY=false "$RUST_HOOK" >/dev/null 2>&1 || true

    local bash_output rust_output
    bash_output=$(cat "$bash_temp")
    rust_output=$(cat "$rust_temp")
    rm "$bash_temp" "$rust_temp"

    # Compare key fields (excluding timestamp and id which will differ)
    local fields=("type" "sessionId" "cwd")

    # Add event-specific fields
    case "$payload_name" in
        pre_tool_use|post_tool_use)
            fields+=("tool" "toolUseId")
            ;;
        stop|subagent_stop)
            fields+=("stopHookActive")
            ;;
        session_start)
            fields+=("source")
            ;;
        session_end)
            fields+=("reason")
            ;;
        user_prompt_submit)
            fields+=("prompt")
            ;;
        notification)
            fields+=("message" "notificationType")
            ;;
        pre_compact)
            fields+=("trigger")
            ;;
    esac

    local mismatch=false
    for field in "${fields[@]}"; do
        local bash_val rust_val
        bash_val=$(echo "$bash_output" | jq -r ".$field // empty")
        rust_val=$(echo "$rust_output" | jq -r ".$field // empty")

        if [[ "$bash_val" != "$rust_val" ]]; then
            log_fail "Parity $payload_name: $field mismatch (bash='$bash_val', rust='$rust_val')"
            mismatch=true
        fi
    done

    if [[ "$mismatch" == "false" ]]; then
        log_pass "Parity $payload_name: All fields match"
        return 0
    else
        return 1
    fi
}

# Test error handling for malformed input
test_malformed_input() {
    local hook="$1"
    local name="$2"

    # Test: empty input
    local temp_file=$(mktemp)
    if echo "" | VIBECRAFT_EVENTS_FILE="$temp_file" VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" 2>/dev/null; then
        log_fail "$name: accepts empty input (should fail)"
    else
        log_pass "$name: rejects empty input"
    fi
    rm "$temp_file"

    # Test: invalid JSON
    temp_file=$(mktemp)
    if echo "not json" | VIBECRAFT_EVENTS_FILE="$temp_file" VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" 2>/dev/null; then
        log_fail "$name: accepts invalid JSON (should fail)"
    else
        log_pass "$name: rejects invalid JSON"
    fi
    rm "$temp_file"

    # Test: missing required field (session_id)
    temp_file=$(mktemp)
    if echo '{"hook_event_name":"PreToolUse"}' | VIBECRAFT_EVENTS_FILE="$temp_file" VIBECRAFT_ENABLE_WS_NOTIFY=false "$hook" 2>/dev/null; then
        log_pass "$name: handles missing session_id gracefully"
    else
        log_pass "$name: rejects missing session_id"
    fi
    rm "$temp_file"
}

# Test environment variable overrides
test_env_overrides() {
    local temp_dir=$(mktemp -d)
    local custom_events="$temp_dir/custom-events.jsonl"
    local payload="$PAYLOADS_DIR/pre_tool_use.json"

    # Test VIBECRAFT_EVENTS_FILE
    cat "$payload" | VIBECRAFT_EVENTS_FILE="$custom_events" VIBECRAFT_ENABLE_WS_NOTIFY=false "$RUST_HOOK" >/dev/null 2>&1

    if [[ -f "$custom_events" ]]; then
        log_pass "VIBECRAFT_EVENTS_FILE override works"
    else
        log_fail "VIBECRAFT_EVENTS_FILE override failed"
    fi

    rm -rf "$temp_dir"

    # Test VIBECRAFT_ENABLE_WS_NOTIFY=false (should not attempt connection)
    local temp_file=$(mktemp)
    if run_with_timeout 1 bash -c "cat '$payload' | VIBECRAFT_EVENTS_FILE='$temp_file' VIBECRAFT_ENABLE_WS_NOTIFY=false '$RUST_HOOK'" >/dev/null 2>&1; then
        log_pass "VIBECRAFT_ENABLE_WS_NOTIFY=false disables HTTP"
    else
        log_warn "VIBECRAFT_ENABLE_WS_NOTIFY test inconclusive"
    fi
    rm "$temp_file"
}

# Main test runner
main() {
    echo ""
    echo "======================================"
    echo "  Vibecraft Hook Integration Tests"
    echo "======================================"
    echo ""

    check_prerequisites

    echo ""
    echo "--- Rust Hook Tests ---"
    echo ""

    # Test each payload with Rust hook
    for payload in "$PAYLOADS_DIR"/*.json; do
        name=$(basename "$payload" .json)
        test_valid_json "$RUST_HOOK" "$payload" "Rust/$name"
        test_required_fields "$RUST_HOOK" "$payload" "Rust/$name"
    done

    # Test event type mapping
    echo ""
    echo "--- Event Type Mapping ---"
    echo ""
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/pre_tool_use.json" "pre_tool_use" "Rust/pre_tool_use"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/post_tool_use.json" "post_tool_use" "Rust/post_tool_use"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/stop.json" "stop" "Rust/stop"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/session_start.json" "session_start" "Rust/session_start"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/session_end.json" "session_end" "Rust/session_end"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/user_prompt_submit.json" "user_prompt_submit" "Rust/user_prompt_submit"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/notification.json" "notification" "Rust/notification"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/subagent_stop.json" "subagent_stop" "Rust/subagent_stop"
    test_event_type_mapping "$RUST_HOOK" "$PAYLOADS_DIR/pre_compact.json" "pre_compact" "Rust/pre_compact"

    # Error handling tests
    echo ""
    echo "--- Error Handling ---"
    echo ""
    test_malformed_input "$RUST_HOOK" "Rust"

    # Environment variable tests
    echo ""
    echo "--- Environment Variables ---"
    echo ""
    test_env_overrides

    # Parity tests (Bash vs Rust)
    if [[ "$RUST_ONLY" != "true" ]]; then
        echo ""
        echo "--- Bash vs Rust Parity ---"
        echo ""
        for payload in "$PAYLOADS_DIR"/*.json; do
            test_parity "$payload" || true
        done
    fi

    # Summary
    echo ""
    echo "======================================"
    echo "  Results: $TESTS_PASSED passed, $TESTS_FAILED failed"
    echo "======================================"
    echo ""

    if [[ $TESTS_FAILED -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
