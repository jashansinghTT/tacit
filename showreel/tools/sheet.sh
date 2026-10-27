#!/usr/bin/env bash
# Contact sheet of a clip for review: frames from FROM to TO (s, clip time) every STEP s, tiled COLSx?,
# each labelled with its time.   tools/sheet.sh clip.mp4 out.jpg FROM TO STEP [COLS] [WIDTH]
set -euo pipefail
in=$1 out=$2 from=$3 to=$4 step=$5 cols=${6:-6} w=${7:-480}
n=$(python3 -c "import math; print(max(1, math.floor(($to - $from) / $step + 1e-6) + 1))")
rows=$(( (n + cols - 1) / cols ))
ffmpeg -loglevel error -y -ss "$from" -i "$in" -t "$(python3 -c "print($to - $from + 0.001)")" \
  -vf "fps=1/$step,scale=$w:-2,drawtext=text='%{pts\:hms}':x=8:y=8:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.5,tile=${cols}x${rows}:padding=3:color=gray" \
  -frames:v 1 "$out"
