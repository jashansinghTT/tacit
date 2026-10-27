"""Offscreen rendering (EGL) of the scene cameras.

MuJoCo's EGL context belongs to the thread that created it: create, use and close a `Cameras`
on one thread. On this host EGL falls back to Mesa's software renderer (the user is not in the
`render` group), so frames are kept small and shadows off for GR00T's cameras.
"""

from __future__ import annotations

import base64
import io
import os

os.environ.setdefault("MUJOCO_GL", "egl")

import mujoco  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402


class Cameras:
    def __init__(self, model: mujoco.MjModel, width: int = 320, height: int = 180, shadows: bool = False):
        self.model = model
        self.renderer = mujoco.Renderer(model, height, width)
        self.shadows = shadows
        self._sun = model.light("sun").id if _has_light(model, "sun") else None

    def render(self, data: mujoco.MjData, camera: str) -> np.ndarray:
        if self._sun is not None:
            self.model.light_castshadow[self._sun] = int(self.shadows)
        self.renderer.update_scene(data, camera=camera)
        return self.renderer.render().copy()

    def close(self) -> None:
        if self.renderer is not None:
            self.renderer.close()
            self.renderer = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


def _has_light(model, name) -> bool:
    try:
        model.light(name)
        return True
    except KeyError:
        return False


def encode_jpeg(img: np.ndarray, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def jpeg_b64(img: np.ndarray, quality: int = 85) -> str:
    return base64.b64encode(encode_jpeg(img, quality)).decode()
