#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PACKAGE_DIR/.build/release"
DIST_DIR="$PACKAGE_DIR/dist"
APP_NAME="Content Relay.app"
APP_DIR="$DIST_DIR/$APP_NAME"
EXECUTABLE_NAME="ContentRelayMacOSApp"

cd "$PACKAGE_DIR"

swift build -c release --product "$EXECUTABLE_NAME"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

cp "$BUILD_DIR/$EXECUTABLE_NAME" "$APP_DIR/Contents/MacOS/$EXECUTABLE_NAME"
cp "$PACKAGE_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"

plutil -lint "$APP_DIR/Contents/Info.plist" >/dev/null

echo "Built $APP_DIR"
