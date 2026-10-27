#!/usr/bin/env bash
# Rebuild the fake camera and microphone media for the browser E2E tests (Chromium fake capture devices).
#
#   scripts/e2e/make_media.sh [capture_video] [practice_video]
#
# Writes to ${TACIT_E2E_MEDIA:-~/tacit/data/e2e} (gitignored):
#   capture.y4m    640x360 at 15 fps, the expert at work (Studio live capture)
#   practice.y4m   640x360 at 15 fps, the same kind of motion for Learn practice
#   answer.wav     16 kHz mono: silence, a spoken "why" answer, silence (the browser's VAD cuts it)
#   question.wav   16 kHz mono: a spoken question for the tutor
#   *.txt          the text spoken in each WAV, for the tests to compare transcripts against
#
# Videos default to the first real sample in ~/tacit/data/samples/samples.json. Speech comes from S2 Pro
# through the backend (POST /api/speech/tts), so the backend must be up.
set -euo pipefail

BASE="${TACIT_URL:-http://127.0.0.1:8710}"
SAMPLES="${TACIT_SAMPLES:-$HOME/tacit/data/samples}"
OUT="${TACIT_E2E_MEDIA:-$HOME/tacit/data/e2e}"
SECONDS_MAX="${E2E_VIDEO_SECONDS:-40}"
ANSWER_TEXT="Because the parts on the left are already sorted, so I check them before I place them in the tray."
QUESTION_TEXT="What should I check before I start this task?"

mkdir -p "$OUT"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

first_real_sample() {
  python3 - "$SAMPLES/samples.json" <<'EOF'
import json, os, sys
items = json.load(open(sys.argv[1]))
real = [s for s in items if s.get("kind", "real") == "real"]
print(os.path.basename(real[0]["video"]) if real else "")
EOF
}

capture="${1:-}"
practice="${2:-}"
if [[ -z "$capture" ]]; then
  [[ -f "$SAMPLES/samples.json" ]] || { echo "no $SAMPLES/samples.json; pass the capture video as an argument" >&2; exit 1; }
  capture="$SAMPLES/$(first_real_sample)"
fi
practice="${practice:-$capture}"
for f in "$capture" "$practice"; do
  [[ -f "$f" ]] || { echo "missing video: $f" >&2; exit 1; }
done

to_y4m() {  # src dst: letterbox into 640x360, 15 fps, yuv420p (what Chromium's file capture expects)
  ffmpeg -loglevel error -y -i "$1" -t "$SECONDS_MAX" -an \
    -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,fps=15,format=yuv420p" \
    -f yuv4mpegpipe "$2"
}

speak() {  # text dst pad_before pad_after (kept if the same text was spoken before; E2E_FORCE_SPEECH=1 redoes it)
  if [[ -z "${E2E_FORCE_SPEECH:-}" && -f "$2" && "$(cat "${2%.wav}.txt" 2>/dev/null)" == "$1" ]]; then
    echo "  keep $2"
    return
  fi
  local url
  url="$(curl -fsS -X POST "$BASE/api/speech/tts" -H 'content-type: application/json' \
          -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "voice": "default", "lang": "en"}))' "$1")" |
         python3 -c 'import json,sys; print(json.load(sys.stdin)["audio"])')"
  curl -fsS "$BASE$url" -o "$tmp/raw.wav"
  ffmpeg -loglevel error -y -i "$tmp/raw.wav" -ac 1 -ar 16000 -c:a pcm_s16le \
    -af "adelay=$(( ${3%.*} * 1000 )):all=1,apad=pad_dur=$4" "$2"
  printf '%s\n' "$1" > "${2%.wav}.txt"
}

echo "capture  <- $capture"
to_y4m "$capture" "$OUT/capture.y4m"
echo "practice <- $practice"
to_y4m "$practice" "$OUT/practice.y4m"
echo "answer.wav, question.wav <- S2 Pro via $BASE"
speak "$ANSWER_TEXT" "$OUT/answer.wav" 1 3
speak "$QUESTION_TEXT" "$OUT/question.wav" 1 3
printf '%s\n' "$(basename "$capture")" > "$OUT/capture.source"
printf '%s\n' "$(basename "$practice")" > "$OUT/practice.source"
ls -la "$OUT"
