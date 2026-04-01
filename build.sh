#!/usr/bin/env bash
# AgentShell — build & run helper
# Usage:
#   ./build.sh        # dev mode (hot reload, faster)
#   ./build.sh build  # production build (outputs to src-tauri/target/release/bundle/)

set -e

cd "$(dirname "$0")"

# Ensure PATH has cargo and bun/npm
export PATH="$HOME/.cargo/bin:$PATH"

# Pick the JS package manager
if command -v bun &>/dev/null; then
    PM="bun"
elif command -v npm &>/dev/null; then
    PM="npm"
else
    echo "ERROR: neither bun nor npm found" >&2
    exit 1
fi

echo "==> Package manager: $PM"
echo "==> Installing JS dependencies..."
$PM install --frozen-lockfile 2>/dev/null || $PM install

if [[ "$1" == "build" ]]; then
    echo "==> Production build..."
    $PM run tauri build
    echo ""
    echo "Bundle output:"
    find src-tauri/target/release/bundle -type f 2>/dev/null | head -20
else
    echo "==> Starting dev mode (Ctrl+C to quit)..."
    set +e
    $PM run tauri dev
    DEV_EXIT=$?
    set -e

    # Graceful termination cases:
    # - 130: interrupted (Ctrl+C)
    # - 143: SIGTERM (e.g. app window closed and dev server is terminated)
    if [[ "$DEV_EXIT" == "0" || "$DEV_EXIT" == "130" || "$DEV_EXIT" == "143" ]]; then
        echo "==> Dev mode exited."
        exit 0
    fi
    exit "$DEV_EXIT"
fi
