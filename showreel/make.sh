#!/usr/bin/env bash
# Render and encode the review gates. Frames go to ~/tacit/data/showreel/frames/<name>/, videos to
# ~/tacit/data/showreel/<name>.mp4 (1080p H.264, AAC, the mastered soundtrack cut to the same range).
#
#   showreel/make.sh previews          # the four preview clips
#   showreel/make.sh cut               # the full first cut
#   showreel/make.sh previews-from-cut # the previews, encoded from the first cut's frames
#   showreel/make.sh clip NAME FROM TO # any range
set -euo pipefail
cd "$(dirname "$0")"
DATA=${SHOWREEL_DATA:-$HOME/tacit/data/showreel}
WORKERS=${WORKERS:-3}
MASTER=$DATA/music/master.wav

clip() {
  local name=$1 from=$2 to=$3
  echo "== $name: $from s to $to s"
  node render.mjs --from "$from" --to "$to" --workers "$WORKERS" --out "$DATA/frames/$name"
  .venv/bin/python tools/encode.py "$DATA/frames/$name" "$DATA/$name.mp4" --audio "$MASTER" --start "$from" \
    --fade-in "${FADE_IN:-0}" --fade-out "${FADE_OUT:-0}"
}

# A preview cut out of an already rendered clip's frames (no re-render): NAME FROM TO SRC SRC_FROM
excerpt() {
  local name=$1 from=$2 to=$3 src=$4 src_from=$5
  local first count
  first=$(python3 -c "print(round(($from - $src_from) * 30))")
  count=$(python3 -c "print(round(($to - $from) * 30))")
  echo "== $name: $from s to $to s from $src"
  .venv/bin/python tools/encode.py "$DATA/frames/$src" "$DATA/$name.mp4" --audio "$MASTER" --start "$from" \
    --first "$first" --count "$count" --fade-in "${FADE_IN:-0}" --fade-out "${FADE_OUT:-0}"
}

case "${1:-}" in
  previews)
    FADE_OUT=0.3 clip preview-1-title 0 25.0
    FADE_IN=0.3 FADE_OUT=0.3 clip preview-2-watch-to-check 30.0 35.6
    FADE_IN=0.3 FADE_OUT=0.3 clip preview-3-teach-to-do 41.6 47.4
    FADE_IN=0.3 clip preview-4-outro 60.4 74.3
    ;;
  cut) clip first-cut 0 74.3 ;;
  previews-from-cut)
    FADE_OUT=0.3 excerpt preview-1-title 0 25.0 first-cut 0
    FADE_IN=0.3 FADE_OUT=0.3 excerpt preview-2-watch-to-check 30.0 35.6 first-cut 0
    FADE_IN=0.3 FADE_OUT=0.3 excerpt preview-3-teach-to-do 41.6 47.4 first-cut 0
    FADE_IN=0.3 excerpt preview-4-outro 60.4 74.3 first-cut 0
    ;;
  clip) clip "$2" "$3" "$4" ;;
  *) echo "usage: $0 previews | cut | previews-from-cut | clip NAME FROM TO"; exit 2 ;;
esac
