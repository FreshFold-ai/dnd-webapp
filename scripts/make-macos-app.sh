#!/usr/bin/env bash
set -euo pipefail

APP_NAME="RoomApp"
OUT_DIR="dist"
APP_DIR="$OUT_DIR/$APP_NAME.app"
BIN_NAME="$APP_NAME"

mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cat > "$APP_DIR/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>
  <string>$BIN_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>com.example.roomapp</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
EOF

cat > "$APP_DIR/Contents/MacOS/$BIN_NAME" <<'SH'
#!/bin/bash
# Minimal launcher executable script for macOS .app bundle
DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$DIR"
exec node launcher/start-app.js
SH

chmod +x "$APP_DIR/Contents/MacOS/$BIN_NAME"

echo "Created $APP_DIR"
echo "Note: This .app is a thin wrapper that invokes the local Node runtime. Ensure Node is installed on the target machine."
