#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="dist"
mkdir -p "$OUT_DIR"

echo "Building Windows executable using pkg (requires pkg installed)"
echo "If you don't have pkg installed globally, the script will use npx."

TARGETS="node18-win-x64"
OUTFILE="$OUT_DIR/RoomApp-win.exe"

npx pkg launcher/start-app.js --targets "$TARGETS" --output "$OUTFILE"

echo "Windows executable created: $OUTFILE"
