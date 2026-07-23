#!/usr/bin/env bash
set -euo pipefail

echo "== Apple development environment =="
echo "macOS: $(sw_vers -productVersion) ($(uname -m))"

if [[ -d "/Applications/Xcode.app/Contents/Developer" ]]; then
  echo "Xcode: /Applications/Xcode.app"
  DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" xcodebuild -version
else
  echo "Xcode: NOT INSTALLED"
  echo "Current developer directory: $(xcode-select -p 2>/dev/null || echo unavailable)"
  echo "Install Xcode from the App Store or Apple Developer Downloads, then run this script again."
  exit 2
fi

DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" xcodebuild -showsdks
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" xcrun simctl list runtimes
DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" xcrun simctl list devices available

echo "Swift: $(DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" xcrun swift --version | head -1)"
echo "Environment check passed."
