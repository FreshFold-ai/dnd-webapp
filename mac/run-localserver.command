#!/bin/bash
# Double-click this file on macOS to launch the server and open the public URL.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
node launcher/start-app.js
