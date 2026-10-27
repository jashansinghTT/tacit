#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build the tacit-vision cohost image and stage its package for `tt-model serve`.
#
#   models/cohost-vision/build.sh            # -> image tt-model/cohost-vision:<id12>
#                                            #    + ~/tacit/build/cohost-vision/tt_kernel_manifest.json
#
# Needs the four member images loaded in docker (`tt-model pull changh95/<member>-p150`) and the
# tt-model install with the cohost kind at ~/tacit/.tools/ttm (its tt_kernel.cohost is the runtime
# copied into the image). No network: everything comes from local images.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TTM="${TTM:-$HOME/tacit/.tools/ttm}"
OUT="${OUT:-$HOME/tacit/build/cohost-vision}"
CTX="${CTX:-$HOME/tacit/build/cohost-vision-ctx}"
BASE_IMAGE="${BASE_IMAGE:-tt-model/vggt-1b-p150:2c77d478b134}"
HAMER_IMAGE="${HAMER_IMAGE:-tt-model/hamer-p150:3076831557f0}"
GAZE_IMAGE="${GAZE_IMAGE:-tt-model/gaze-lle-p150:94a42abd6b1a}"
RFDETR_IMAGE="${RFDETR_IMAGE:-tt-model/rf-detr-p150:02df248674e8}"
REPO="tt-model/cohost-vision"

for img in "$BASE_IMAGE" "$HAMER_IMAGE" "$GAZE_IMAGE" "$RFDETR_IMAGE"; do
  docker image inspect "$img" >/dev/null 2>&1 || { echo "missing image $img (tt-model pull it first)" >&2; exit 1; }
done

# 1. build context: the adapters and tt-model's co-host runtime (stdlib-only package)
TTK="$("$TTM/bin/python" -I -c 'import tt_kernel, os; print(os.path.dirname(tt_kernel.__file__))')"
rm -rf "$CTX"
mkdir -p "$CTX/ctx/models" "$CTX/ctx/tt-cohost/tt_kernel/cohost"
cp -r "$HERE/adapters/cohost_vision" "$CTX/ctx/models/cohost_vision"
cp "$TTK/__init__.py" "$CTX/ctx/tt-cohost/tt_kernel/"
cp "$TTK"/cohost/*.py "$CTX/ctx/tt-cohost/tt_kernel/cohost/"
find "$CTX/ctx" -name __pycache__ -prune -exec rm -rf {} +
(cd "$CTX/ctx/tt-cohost/tt_kernel" && sha256sum __init__.py cohost/*.py > "$CTX/runtime.sha256")

# 2. the image, then its digest tag (the way `tt-model package` names images)
# no provenance attestation: it carries a timestamp, so every build would get a new id and tag
docker build -f "$HERE/Dockerfile" -t "$REPO:build" --provenance=false --sbom=false \
  --build-arg BASE_IMAGE="$BASE_IMAGE" --build-arg HAMER_IMAGE="$HAMER_IMAGE" \
  --build-arg GAZE_IMAGE="$GAZE_IMAGE" --build-arg RFDETR_IMAGE="$RFDETR_IMAGE" "$CTX"
ID="$(docker image inspect "$REPO:build" --format '{{.Id}}')"
TAG="$REPO:${ID#sha256:}"; TAG="${TAG:0:$(( ${#REPO} + 13 ))}"
docker tag "$REPO:build" "$TAG"

# 3. the staged package: the published manifest rendered by tt-model's own code
"$TTM/bin/python" -I "$HERE/render_manifest.py" "$HERE/tt-model.yaml" --image "$TAG" --digest "$ID" \
  --base-image "$BASE_IMAGE" --member-images "$HAMER_IMAGE,$GAZE_IMAGE,$RFDETR_IMAGE" \
  --git-rev "$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || true)" --out "$OUT"
cp "$CTX/runtime.sha256" "$OUT/"
echo "image $TAG"
echo "serve: $TTM/bin/tt-model serve $OUT/tt_kernel_manifest.json --device-id 0 --port 21000"
