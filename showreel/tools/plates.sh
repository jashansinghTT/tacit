#!/usr/bin/env bash
# Footage plates for the reel: the vase sample's original (Pexels 6608029, 2732x1440, 24 fps),
# cropped exactly as the app's sample (centre 2560x1440, so sample pixel (x, y) = (86 + 2x, 2y)
# here at the same time) and conformed to 30 fps with motion-compensated interpolation.
# Frame n is time n/30 s on the sample's (and the tracks') timeline. Four chunks run in parallel.
set -euo pipefail
SRC=${1:-$HOME/tacit/data/samples/raw/pexels_6608029.mp4}
OUT=${2:-$HOME/tacit/data/showreel/plates/vase}
DUR=${3:-44.5}
CHUNKS=4
mkdir -p "$OUT"
len=$(python3 -c "import math; print(math.ceil($DUR / $CHUNKS))")
for k in $(seq 0 $((CHUNKS - 1))); do
  start=$((k * len))
  first=$((start * 30))
  ffmpeg -loglevel error -y -ss "$start" -t "$len" -i "$SRC" \
    -vf "crop=2560:1440:86:0,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
    -q:v 3 -start_number "$first" "$OUT/f_%05d.jpg" &
done
wait
ls "$OUT" | wc -l
