#!/bin/bash
# Build vibecraft-hook for all supported platforms
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create output directory
mkdir -p ../bin

echo "Building vibecraft-hook for all platforms..."
echo ""

# macOS ARM64 (Apple Silicon)
echo "🍎 Building for macOS ARM64..."
cargo build --release --target aarch64-apple-darwin
cp target/aarch64-apple-darwin/release/vibecraft-hook ../bin/vibecraft-hook-darwin-arm64
echo "   ✓ ../bin/vibecraft-hook-darwin-arm64"

# macOS x86_64 (Intel)
echo "🍎 Building for macOS x86_64..."
cargo build --release --target x86_64-apple-darwin
cp target/x86_64-apple-darwin/release/vibecraft-hook ../bin/vibecraft-hook-darwin-x64
echo "   ✓ ../bin/vibecraft-hook-darwin-x64"

# Create universal macOS binary
echo "🍎 Creating universal macOS binary..."
lipo -create \
  target/aarch64-apple-darwin/release/vibecraft-hook \
  target/x86_64-apple-darwin/release/vibecraft-hook \
  -output ../bin/vibecraft-hook-darwin-universal
echo "   ✓ ../bin/vibecraft-hook-darwin-universal"

# Linux x86_64 (musl for static linking)
# Note: Requires musl cross-compiler. Skip if not available.
if command -v x86_64-linux-musl-gcc &> /dev/null || [ -f /usr/local/bin/x86_64-linux-musl-gcc ]; then
  echo "🐧 Building for Linux x86_64..."
  CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=x86_64-linux-musl-gcc \
    cargo build --release --target x86_64-unknown-linux-musl
  cp target/x86_64-unknown-linux-musl/release/vibecraft-hook ../bin/vibecraft-hook-linux-x64
  echo "   ✓ ../bin/vibecraft-hook-linux-x64"
else
  echo "⏭️  Skipping Linux build (musl cross-compiler not found)"
  echo "   Install with: brew install FiloSottile/musl-cross/musl-cross"
fi

echo ""
echo "Build complete! Binaries in ../bin/:"
ls -lh ../bin/
