#!/bin/bash
# Vibecraft Hook Benchmark Suite
# Compares bash vs rust hook performance

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(dirname "$SCRIPT_DIR")"
PAYLOADS_DIR="$SCRIPT_DIR/payloads"
RESULTS_DIR="$SCRIPT_DIR/results"

# Ensure results directory exists
mkdir -p "$RESULTS_DIR"

# Check for hyperfine
if ! command -v hyperfine &> /dev/null; then
  echo "hyperfine not found. Install with: brew install hyperfine"
  exit 1
fi

BASH_HOOK="$HOOKS_DIR/vibecraft-hook.sh"
RUST_HOOK="$HOOKS_DIR/rust/target/release/vibecraft-hook"

# Create temp directory for output files (prevent polluting real data)
TEMP_DIR=$(mktemp -d)
export VIBECRAFT_DATA_DIR="$TEMP_DIR"
export VIBECRAFT_ENABLE_WS_NOTIFY="false"  # Disable HTTP notify for benchmarks

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=============================================="
echo "Vibecraft Hook Benchmark Suite"
echo "=============================================="
echo ""
echo "Temp data dir: $TEMP_DIR"
echo "WS notify: disabled"
echo ""

# Function to run benchmarks for a hook
run_benchmark() {
  local hook_name="$1"
  local hook_path="$2"
  local output_file="$RESULTS_DIR/${hook_name}_results.json"

  if [ ! -x "$hook_path" ]; then
    echo "⏭️  Skipping $hook_name (not found or not executable: $hook_path)"
    return 1
  fi

  echo "🔥 Benchmarking $hook_name..."
  echo ""

  # Benchmark each payload type
  for payload in "$PAYLOADS_DIR"/*.json; do
    payload_name=$(basename "$payload" .json)
    echo "  📦 $payload_name"

    hyperfine \
      --warmup 5 \
      --runs 50 \
      --export-json "$RESULTS_DIR/${hook_name}_${payload_name}.json" \
      "cat '$payload' | '$hook_path'" \
      2>/dev/null || echo "    ⚠️  Failed"
  done

  echo ""
}

# Function to show a single benchmark result
show_result() {
  local file="$1"
  if [ -f "$file" ]; then
    local mean=$(jq -r '.results[0].mean * 1000 | floor' "$file" 2>/dev/null || echo "N/A")
    local stddev=$(jq -r '.results[0].stddev * 1000 | floor' "$file" 2>/dev/null || echo "N/A")
    echo "${mean}ms ± ${stddev}ms"
  else
    echo "N/A"
  fi
}

# Run bash benchmarks
echo "=============================================="
echo "BASH HOOK BENCHMARKS"
echo "=============================================="
run_benchmark "bash" "$BASH_HOOK"

# Run rust benchmarks (if available)
echo "=============================================="
echo "RUST HOOK BENCHMARKS"
echo "=============================================="
if [ -x "$RUST_HOOK" ]; then
  run_benchmark "rust" "$RUST_HOOK"
else
  echo "⏭️  Rust binary not found. Build with:"
  echo "   cd hooks/rust && cargo build --release"
  echo ""
fi

# Generate comparison table
echo "=============================================="
echo "RESULTS SUMMARY"
echo "=============================================="
echo ""
printf "%-20s | %-15s | %-15s | %s\n" "Payload" "Bash" "Rust" "Speedup"
printf "%-20s-+-%-15s-+-%-15s-+-%s\n" "--------------------" "---------------" "---------------" "--------"

for payload in "$PAYLOADS_DIR"/*.json; do
  payload_name=$(basename "$payload" .json)
  bash_file="$RESULTS_DIR/bash_${payload_name}.json"
  rust_file="$RESULTS_DIR/rust_${payload_name}.json"

  bash_mean=$(jq -r '.results[0].mean * 1000' "$bash_file" 2>/dev/null || echo "0")
  rust_mean=$(jq -r '.results[0].mean * 1000' "$rust_file" 2>/dev/null || echo "0")

  bash_str=$(printf "%.2fms" "$bash_mean" 2>/dev/null || echo "N/A")
  rust_str=$(printf "%.2fms" "$rust_mean" 2>/dev/null || echo "N/A")

  if [ "$rust_mean" != "0" ] && [ "$bash_mean" != "0" ]; then
    speedup=$(echo "scale=1; $bash_mean / $rust_mean" | bc 2>/dev/null || echo "N/A")
    speedup_str="${speedup}x"
  else
    speedup_str="N/A"
  fi

  printf "%-20s | %-15s | %-15s | %s\n" "$payload_name" "$bash_str" "$rust_str" "$speedup_str"
done

echo ""
echo "Results saved to: $RESULTS_DIR/"
