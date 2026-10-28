#!/bin/sh
# duo-simulator: an optional last look in the real Safari 27.1, on Xcode's iPhone Duo simulator. macOS only.
#
#   sh duo-simulator.sh https://example.com [out-dir]
#
# It never fails the run: when it can't run (not a Mac, no Xcode 27.1, no iPhone Duo simulator) it prints
# "SKIPPED: <reason>" and exits 0, and the report says the Safari pass was skipped and why.
# Status: written against simctl's documented commands, not yet run on Xcode 27.1 (the machine it was written
# on had no Xcode). On first use, check the device-type and runtime lines below match `xcrun simctl list`.

URL="$1"
OUT="${2:-duo-report}"
[ -n "$URL" ] || { echo "Usage: sh duo-simulator.sh <url> [out-dir]"; exit 2; }
skip() { echo "SKIPPED: $1"; exit 0; }

[ "$(uname)" = "Darwin" ] || skip "not macOS. The iPhone Duo simulator needs Xcode 27.1 or later on a Mac."
command -v xcrun >/dev/null 2>&1 || skip "xcrun not found. Install Xcode 27.1 or later."
VERSION=$(xcodebuild -version 2>/dev/null | awk '/^Xcode/ {print $2}')
[ -n "$VERSION" ] || skip "only the Command Line Tools are installed. Install Xcode 27.1 or later."
MAJOR=$(echo "$VERSION" | cut -d. -f1); MINOR=$(echo "$VERSION" | cut -d. -f2); MINOR=${MINOR:-0}
if [ "$MAJOR" -lt 27 ] || { [ "$MAJOR" -eq 27 ] && [ "$MINOR" -lt 1 ]; }; then skip "Xcode $VERSION is older than 27.1, which adds the iPhone Duo simulator."; fi

TYPE=$(xcrun simctl list devicetypes 2>/dev/null | grep -i "iPhone Duo" | head -1 | sed -E 's/.*\((com\.apple\.CoreSimulator\.SimDeviceType\.[^)]*)\).*/\1/')
[ -n "$TYPE" ] || skip "no iPhone Duo device type in this Xcode. Add it in Xcode › Settings › Components or Device Hub."
RUNTIME=$(xcrun simctl list runtimes 2>/dev/null | grep -E "iOS 27\.([1-9]|[1-9][0-9])" | tail -1 | sed -E 's/.* - (com\.apple\.CoreSimulator\.SimRuntime\.[^ ]*).*/\1/')
[ -n "$RUNTIME" ] || skip "no iOS 27.1 runtime installed."

mkdir -p "$OUT"
UDID=$(xcrun simctl create "fit-iphone-duo" "$TYPE" "$RUNTIME") || skip "could not create the simulator."
cleanup() { xcrun simctl shutdown "$UDID" >/dev/null 2>&1; xcrun simctl delete "$UDID" >/dev/null 2>&1; }
trap cleanup EXIT
xcrun simctl boot "$UDID" && xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || skip "the simulator did not boot."
open -a Simulator >/dev/null 2>&1
xcrun simctl openurl "$UDID" "$URL"
sleep 8
xcrun simctl io "$UDID" screenshot "$OUT/safari-closed.png" >/dev/null 2>&1 && echo "Saved $OUT/safari-closed.png (closed, Safari 27.1)."

cat <<EOF

The page is open in Safari 27.1 on the iPhone Duo simulator. simctl can't open, fold or turn the device,
so do the other poses by hand in the Simulator window (the controls under the device), and save each with:

  xcrun simctl io $UDID screenshot "$OUT/safari-<pose>.png"

Check in each pose what the audit can't: Safari's own bars over your page, the background colour Safari paints
behind them, and the real crease position on "Open, tall". The playground's sample page reads its own size,
posture and segments live, so it doubles as a probe:
  https://marigameo.github.io/iphone-duo-playground/sample/

EOF

# Run by a person in a terminal: wait for them, then clean up. Run by an agent (no terminal to read from):
# waiting would return at once and delete the simulator before anyone could use it, so leave it running.
if [ -t 0 ]; then
  echo "Press Return when done; the simulator is then shut down and deleted."
  read -r _
else
  trap - EXIT
  echo "The simulator stays open for the owner to use. When they're done, remove it with:"
  echo "  xcrun simctl shutdown $UDID && xcrun simctl delete $UDID"
fi
