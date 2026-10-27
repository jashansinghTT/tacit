# SPDX-License-Identifier: Apache-2.0
"""Render tt-model.yaml into the published manifest (tt_kernel_manifest.json) for a built image.

tt-model's own ``package`` refuses to build kind-cohost images, so build.sh builds the image and
this script does the other half of ``package``: validate the authored manifest and render the
v5.1 wire manifest with tt-model's code (``ContainerManifest.to_wire``), naming the image by its
docker id the way ``package`` does. Run it with the Python of the tt-model install that serves it:

    ~/tacit/.tools/ttm/bin/python render_manifest.py tt-model.yaml --image TAG --digest ID \
        --base-image BASE --out DIR
"""
from __future__ import annotations

import argparse
import datetime
import json
import shutil
import socket
from pathlib import Path

import tt_kernel
from tt_kernel.container_manifest import load_container_manifest
from tt_kernel.launchers import launcher_for


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("yaml")
    ap.add_argument("--image", required=True, help="the built image's tag, tt-model/<name>:<id12>")
    ap.add_argument("--digest", required=True, help="docker's id of that image (sha256:...)")
    ap.add_argument("--base-image", required=True)
    ap.add_argument("--member-images", default="", help="comma list of the images member code came from")
    ap.add_argument("--tt-metal-version", default="0.75.0rc10.dev657+g8b98410e730")
    ap.add_argument("--git-rev", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    m = load_container_manifest(a.yaml)
    launcher = launcher_for(m.kind)
    launcher.validate(m)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    built = {"image": a.image, "base_image": a.base_image, "created_at": now,
             "tt_model_version": tt_kernel.__version__, "built_by": "models/cohost-vision/build.sh",
             "member_images": [x for x in a.member_images.split(",") if x],
             "source_rev": a.git_rev,
             "tt_metal": {"scm_version": a.tt_metal_version, "sha": "8b98410e730bb504fea43a88609756e34821d91d"}}
    wire = m.to_wire(image_tag=a.image, digest=a.digest, tt_metal_version=a.tt_metal_version,
                     tt_kernel_version=tt_kernel.__version__, built=built, code_dir=None,
                     hostname=socket.gethostname(), created_at=now)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / tt_kernel.MANIFEST_NAME).write_text(wire.to_json())
    shutil.copy(a.yaml, out / "tt-model.yaml")
    # what the container will be handed, for review (the serve path composes the same)
    prof = wire.container.resolve_profile(None).model_copy(update={"port": wire.container.serve.port})
    env = launcher.serve_env(wire, prof)
    (out / "cohost-config.json").write_text(json.dumps(json.loads(env["TT_COHOST_CONFIG"]), indent=1) + "\n")
    print(f"{out / tt_kernel.MANIFEST_NAME}: {a.image} ({a.digest[:19]}), "
          f"ports {launcher.published_ports(wire, prof)}")


if __name__ == "__main__":
    main()
