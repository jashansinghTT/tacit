#!/usr/bin/env bash
# Start the tacit-vision cohost group (HaMeR, Gaze-LLE, RF-DETR, VGGT-1B) on chip 0 and wait
# until every member answers: ports 21000-21003, cohost status on 21004.
#
#   deploy/vision-up.sh [--timeout SECONDS]      # default 2400 (a cold boot compiles ~20 min)
#
# Builds the image and staged manifest first if they are missing (models/cohost-vision/build.sh).
# If one of the four standalone vision packages holds chip 0, it is stopped first (tt-model stop);
# anything else on chip 0 is left alone and the script fails. Exits 0 once all four members are
# healthy (also when the group was already up), 1 on a failed or timed-out boot.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TT_MODEL="${TT_MODEL:-$HOME/tacit/.tools/ttm/bin/tt-model}"
PKG="${PKG:-$HOME/tacit/build/cohost-vision}"
MANIFEST="$PKG/tt_kernel_manifest.json"
NAME=tt-model-cohost-vision-p150
BASE_PORT=21000
STATUS_PORT=21004
TIMEOUT=2400
[ "${1:-}" = "--timeout" ] && TIMEOUT="$2"
STANDALONE=(changh95/hamer-p150 changh95/gaze-lle-p150 changh95/rf-detr-p150 changh95/vggt-1b-p150)

say() { printf '[vision-up] %s\n' "$*"; }

members_healthy() {
  local p
  for p in 0 1 2 3; do
    curl -sf -m 3 "http://127.0.0.1:$((BASE_PORT + p))/health" 2>/dev/null | grep -q '"status": *"ok"' || return 1
  done
  curl -sf -m 3 "http://127.0.0.1:$STATUS_PORT/" >/dev/null 2>&1
}

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" = "true" ] && members_healthy; then
  say "already up: ports $BASE_PORT-$((BASE_PORT + 3)), status $STATUS_PORT"
  exit 0
fi

# the image and the staged manifest
if [ ! -f "$MANIFEST" ] || ! docker image inspect "$(python3 -c "import json,sys; print(json.load(open('$MANIFEST'))['container']['image']['tag'])")" >/dev/null 2>&1; then
  say "building the image and staging $PKG"
  "$ROOT/models/cohost-vision/build.sh"
fi

# chip 0: only ours (or a standalone vision package we replace)
for c in $(docker ps --filter label=org.tenstorrent.tt-model.devices=0 --format '{{.Names}}'); do
  [ "$c" = "$NAME" ] && continue
  model="$(docker inspect -f '{{index .Config.Labels "org.tenstorrent.tt-model"}}' "$c")"
  if printf '%s\n' "${STANDALONE[@]}" | grep -qx "changh95/$model"; then
    say "chip 0 holds standalone $model; stopping it"
    "$TT_MODEL" stop "changh95/$model"
  else
    say "chip 0 is held by $c ($model), which is not a vision package; not touching it" >&2
    exit 1
  fi
done

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
  say "starting the group on chip 0"
  "$TT_MODEL" serve "$MANIFEST" --device-id 0 --port "$BASE_PORT" --detach
fi

t0=$(date +%s)
say "waiting for every member (timeout ${TIMEOUT}s; follow: $TT_MODEL logs $MANIFEST -f)"
last=""
while true; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
    say "the container stopped during boot; last log lines:" >&2
    docker logs --tail 40 "$NAME" 2>&1 | grep -v UMD >&2 || true
    exit 1
  fi
  if members_healthy; then
    say "up in $(( $(date +%s) - t0 ))s: hamer :$BASE_PORT gaze :$((BASE_PORT + 1)) rfdetr :$((BASE_PORT + 2)) vggt :$((BASE_PORT + 3)) status :$STATUS_PORT"
    exit 0
  fi
  step="$(docker logs --tail 200 "$NAME" 2>&1 | grep -oE 'cohost: [a-z0-9]+ (load_model: loaded|compiled|traces captured|ready on port [0-9]+)' | tail -1 || true)"
  [ -n "$step" ] && [ "$step" != "$last" ] && { say "$(( $(date +%s) - t0 ))s: $step"; last="$step"; }
  if [ $(( $(date +%s) - t0 )) -ge "$TIMEOUT" ]; then
    say "timed out after ${TIMEOUT}s; the group is left running (deploy/vision-down.sh stops it)" >&2
    exit 1
  fi
  sleep 5
done
