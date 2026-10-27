#!/usr/bin/env bash
# Pull every Tacit model package (image + weights) so serving never waits on the Hub.
set -uo pipefail
TTM="${TTM:-$HOME/tacit/.tools/ttm/bin/tt-model}"
LOG_DIR="${LOG_DIR:-$HOME/tacit/logs}"
mkdir -p "$LOG_DIR"
PKGS=(
  changh95/hamer-p150
  changh95/gaze-lle-p150
  changh95/rf-detr-p150
  changh95/vggt-1b-p150
  changh95/GR00T-N1.7-3B-p150
  jashansinghTT/cohost-speech-blackhole
  jashansinghTT/gpt-oss-20b-blackhole-fast
)
for p in "${PKGS[@]}"; do
  slug="${p//\//__}"
  (
    echo "[$(date -Is)] pull $p"
    if "$TTM" pull "$p" --with-weights >"$LOG_DIR/pull-$slug.log" 2>&1; then
      echo "[$(date -Is)] OK   $p"
    else
      echo "[$(date -Is)] FAIL $p (see $LOG_DIR/pull-$slug.log)"
    fi
  ) &
done
wait
echo "[$(date -Is)] all pulls finished"
