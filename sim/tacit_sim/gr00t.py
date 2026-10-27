"""GR00T N1.7 (DROID layout) driving the sim, served on chip 3.

Every `requery` GR00T steps (15 Hz, so 2 control steps each) the controller renders the exterior
and wrist cameras at 320x180, sends them with the frames from one second earlier (t-15), the
robot state in DROID's conventions (see droid.py) and the current task's instruction, and gets a
40-step chunk back. It servos the arm to the chunk's absolute joint targets (interpolated to
30 Hz) and the gripper to its position. The sim is off GR00T's training distribution (a Panda
hand, not a Robotiq; rendered images), so success is not expected: it is the baseline.
"""

from __future__ import annotations

import base64
import os
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import numpy as np

from .droid import DROID_HOME, eef_9d, gripper_position
from .env import SimEnv
from .render import Cameras, encode_jpeg

DEFAULT_URL = os.environ.get("TACIT_GR00T_URL", "http://127.0.0.1:21030")
GR00T_HZ = 15
HISTORY_STEPS = 15          # the model's second frame is t-15 at 15 Hz (one second back)
WIDTH, HEIGHT = 320, 180
CAMERAS = {"exterior_image_1_left": "exterior", "wrist_image_left": "wrist"}


class Gr00tError(RuntimeError):
    pass


class Gr00tClient:
    def __init__(self, url: str | None = None, timeout: float = 15.0):
        self.url = (url or DEFAULT_URL).rstrip("/")
        self.http = httpx.Client(timeout=timeout)

    def health(self) -> dict:
        r = self.http.get(f"{self.url}/health")
        r.raise_for_status()
        return r.json()

    def predict(self, images: dict[str, list[bytes]], state: dict, instruction: str, seed: int = 42) -> dict:
        body = {
            "images": {k: [base64.b64encode(b).decode() for b in v] for k, v in images.items()},
            "state": {k: [float(x) for x in v] for k, v in state.items()},
            "instruction": instruction,
            "seed": int(seed),
        }
        last = None
        for attempt in range(2):     # one retry
            try:
                r = self.http.post(f"{self.url}/predict", json=body)
                if r.status_code == 200:
                    return r.json()
                last = f"HTTP {r.status_code}: {r.text[:300]}"
                if r.status_code < 500:
                    break
            except httpx.HTTPError as e:
                last = f"{type(e).__name__}: {e}"
        raise Gr00tError(f"GR00T at {self.url} failed: {last}")

    def close(self) -> None:
        self.http.close()


def droid_state(env: SimEnv) -> dict:
    m, d = env.model, env.data
    hand = m.body("panda_hand").id
    link7 = m.body("panda_link7").id
    return {
        "eef_9d": eef_9d(d.xpos[hand], d.xmat[link7].reshape(3, 3)),
        "gripper_position": [gripper_position(env.finger_width())],
        "joint_position": env.arm_qpos(),
    }


def truncate_instruction(text: str, max_words: int = 30) -> str:
    """GR00T refuses instructions over 51 tokens; 30 words stays well under that."""
    words = text.split()
    return " ".join(words[:max_words])


class Gr00tController:
    """Steps a SimEnv under GR00T. Call `step(env)` once per control step."""

    def __init__(self, env: SimEnv, client: Gr00tClient, cameras: Cameras, requery: int = 8,
                 seed: int = 42, instruction_fn=None, asynchronous: bool = False):
        self.env = env
        self.client = client
        self.cameras = cameras
        self.requery = requery
        self.seed = seed
        self.instruction_fn = instruction_fn
        self.period = requery * 2            # control steps between queries
        self.frames: dict[int, dict[str, np.ndarray]] = {}
        self.actions: dict | None = None
        self.query_step = 0
        self.calls: list[dict] = []          # per query: ms (round trip), server_ms, step
        self.last_query: dict | None = None
        self.asynchronous = asynchronous
        self._pool = ThreadPoolExecutor(1, thread_name_prefix="gr00t") if asynchronous else None
        self._pending = None                 # (future, observation step, instruction)

    @staticmethod
    def start_pose(env: SimEnv) -> None:
        """Move the arm to DROID's reset posture (where DROID episodes start)."""
        env.data.qpos[env.ids.arm_qpos] = DROID_HOME
        env.q_cmd = DROID_HOME.copy()
        env.grip_cmd = 0.0
        env.data.qvel[:] = 0
        import mujoco
        mujoco.mj_forward(env.model, env.data)

    def _need_frame(self, step: int) -> bool:
        lag = HISTORY_STEPS * 2
        return step % self.period == 0 or (step + lag) % self.period == 0

    def frame(self, step: int) -> dict[str, np.ndarray]:
        """Render (once) and cache both cameras at a control step."""
        f = self.frames.get(step)
        if f is None:
            f = {cam: self.cameras.render(self.env.data, cam) for cam in CAMERAS.values()}
            self.frames[step] = f
            # Keep about two seconds of history.
            for k in [k for k in self.frames if k < step - 4 * HISTORY_STEPS]:
                del self.frames[k]
        return f

    def _request(self, step: int) -> tuple[dict, dict, str]:
        now = self.frame(step)
        past_step = max([k for k in self.frames if k <= step - HISTORY_STEPS * 2], default=None)
        past = self.frames[past_step] if past_step is not None else self.frames[min(self.frames)]
        images = {key: [encode_jpeg(past[cam], 95), encode_jpeg(now[cam], 95)] for key, cam in CAMERAS.items()}
        instruction = truncate_instruction(self.instruction_fn() if self.instruction_fn else "Put the object in the bin")
        return images, droid_state(self.env), instruction

    def _call(self, images, state, instruction) -> tuple[dict, float]:
        t0 = time.perf_counter()
        resp = self.client.predict(images, state, instruction, seed=self.seed)
        return resp, (time.perf_counter() - t0) * 1000

    def _accept(self, resp: dict, ms: float, obs_step: int, instruction: str) -> dict:
        self.actions = {k: np.asarray(v, dtype=float) for k, v in resp["actions"].items()}
        self.query_step = obs_step
        info = {"step": obs_step, "applied_at": self.env.steps, "ms": round(ms, 1),
                "server_ms": resp.get("timing_ms", {}).get("total"),
                "device_ms": resp.get("timing_ms", {}).get("device"),
                "instruction": instruction}
        self.calls.append(info)
        self.last_query = info
        return info

    def step(self) -> dict | None:
        """Advance one control step. Returns the query info if a new chunk took over this step.

        Synchronous mode waits for every query (deterministic; used for evaluation). Asynchronous
        mode (realtime streaming) keeps executing the current 40-step chunk while the next query
        is in flight, then joins the new chunk at the step matching its observation time.
        """
        env = self.env
        step = env.steps
        info = None
        if self._need_frame(step):
            self.frame(step)
        due = self.actions is None or step - self.query_step >= self.period
        if not self.asynchronous:
            if due:
                images, state, instruction = self._request(step)
                resp, ms = self._call(images, state, instruction)
                info = self._accept(resp, ms, step, instruction)
        else:
            if self._pending is not None and (self._pending[0].done() or self.actions is None):
                fut, obs_step, instruction = self._pending
                self._pending = None
                resp, ms = fut.result()          # raises Gr00tError on failure
                info = self._accept(resp, ms, obs_step, instruction)
            if due and self._pending is None and info is None:
                images, state, instruction = self._request(step)
                self._pending = (self._pool.submit(self._call, images, state, instruction), step, instruction)
                if self.actions is None:         # nothing to execute yet: wait for the first chunk
                    fut, obs_step, instruction = self._pending
                    self._pending = None
                    resp, ms = fut.result()
                    info = self._accept(resp, ms, obs_step, instruction)
        j = step - self.query_step
        i, frac = divmod(j, 2)
        q = self.actions["joint_position"]
        n = len(q)
        a = q[min(i, n - 1)]
        b = q[min(i + 1, n - 1)]
        target = a + (b - a) * (frac / 2.0)
        g = float(self.actions["gripper_position"][min(i, n - 1)][0])
        env.step_joints(target, float(np.clip(g, 0.0, 1.0)))
        return info

    def close(self) -> None:
        if self._pool is not None:
            self._pool.shutdown(wait=True, cancel_futures=True)
            self._pool = None
