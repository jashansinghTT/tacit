#!/usr/bin/env bash
# Stop the tacit-vision cohost group on chip 0 (clean SIGTERM through tt-model, which closes the
# mesh; never docker kill). Exits 0 when it is stopped or was not running.
set -euo pipefail

TT_MODEL="${TT_MODEL:-$HOME/tacit/.tools/ttm/bin/tt-model}"
MANIFEST="${PKG:-$HOME/tacit/build/cohost-vision}/tt_kernel_manifest.json"
NAME=tt-model-cohost-vision-p150

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
  echo "[vision-down] not running"
  exit 0
fi
[ -f "$MANIFEST" ] || { echo "[vision-down] $MANIFEST is missing; rebuild it with models/cohost-vision/build.sh, then rerun" >&2; exit 1; }
"$TT_MODEL" stop "$MANIFEST"
