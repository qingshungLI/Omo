#!/usr/bin/env bash
set -euo pipefail

XCODE_APP="${XCODE_APP:-/Applications/Xcode.app}"
DEVELOPER_DIR="$XCODE_APP/Contents/Developer"
DEVICE_NAME="${DEVICE_NAME:-AdventureX iPhone}"

if [[ ! -d "$DEVELOPER_DIR" ]]; then
  echo "Xcode was not found at $XCODE_APP. Install Xcode first."
  exit 2
fi

export DEVELOPER_DIR

echo "Selecting $DEVELOPER_DIR"
sudo xcode-select --switch "$DEVELOPER_DIR"
xcodebuild -runFirstLaunch

if ! xcrun simctl list runtimes | grep -q 'iOS'; then
  echo "No iOS Simulator Runtime is installed. Opening Xcode's platform download flow."
  xcodebuild -downloadPlatform iOS || true
fi

RUNTIME_ID="$(python3 - <<'PY'
import json
import subprocess

data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "runtimes", "available", "-j"]))
runtimes = [item for item in data.get("runtimes", []) if item.get("platform") == "iOS" and item.get("isAvailable")]
if not runtimes:
    raise SystemExit("No available iOS runtime. Install one from Xcode > Settings > Components.")
print(sorted(runtimes, key=lambda item: item.get("version", ""), reverse=True)[0]["identifier"])
PY
)"

DEVICE_TYPE_ID="$(xcrun simctl list devicetypes | awk -F '[()]' '/iPhone 16 Pro/ {print $2; exit}')"
if [[ -z "$DEVICE_TYPE_ID" ]]; then
  DEVICE_TYPE_ID="$(xcrun simctl list devicetypes | awk -F '[()]' '/iPhone/ {print $2; exit}')"
fi
if [[ -z "$DEVICE_TYPE_ID" ]]; then
  echo "No iPhone simulator device type is available."
  exit 3
fi

DEVICE_ID="$(xcrun simctl list devices available | awk -v name="$DEVICE_NAME" -F '[()]' '$0 ~ name {print $2; exit}')"
if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(xcrun simctl create "$DEVICE_NAME" "$DEVICE_TYPE_ID" "$RUNTIME_ID")"
  echo "Created simulator: $DEVICE_NAME ($DEVICE_ID)"
else
  echo "Using existing simulator: $DEVICE_NAME ($DEVICE_ID)"
fi

if ! xcrun simctl list devices | grep -q "$DEVICE_ID (Booted)"; then
  xcrun simctl boot "$DEVICE_ID" || true
fi

open -a Simulator
echo "Simulator setup complete: $DEVICE_NAME"
