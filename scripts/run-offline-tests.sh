#!/usr/bin/env bash
set -euo pipefail

# Called only inside a fresh network namespace by runOfflineTest.ts.
# No external interfaces or routes are added, and the host network is unchanged.
test "$#" -eq 5
test "$(readlink /proc/self/ns/net)" != "$4"
ip link set lo up

# VS Code and Xvfb run as the original user, not as root.
exec runuser -u "$1" -- env \
  VSCODE_EXECUTABLE_PATH="$3" \
  PDF_PREVIEW_OFFLINE=1 \
  PDF_PREVIEW_HOST_NETNS="$4" \
  xvfb-run -a "$2" "$5"
