"""Streaming runner for the Robot Lab (`WS /ws/robot/{run_id}` in docs/API.md).

    Runner(program, mode, seed, policy_path=None, human_path=None, gr00t_url=None).frames(realtime=True)

yields the WebSocket messages as dicts: `meta`, then `state` at 30 Hz (every control step),
`camera` at 5 Hz and `gr00t` per query in gr00t mode, then `done`. `run_episode()` runs the same
episode as fast as possible and returns {success, steps, reason}.

Modes:
- scripted: the scripted expert (the program's reference behaviour).
- policy:   the trained behaviour-cloning policy at `policy_path`.
- replay:   the robot follows the expert's wrist path (`human_path`, from `retarget_wrist_path`
            or raw {"points", "times"} in the camera frame).
- gr00t:    GR00T N1.7 on chip 3 drives the arm from rendered cameras.

The simulation runs on its own thread (MuJoCo's EGL context is bound to the thread that made
it), so `frames()` can be consumed from any thread, one `next()` at a time.
"""

from __future__ import annotations

import queue
import threading
import time
from typing import Iterator

import numpy as np

from .demos import instruction, max_steps
from .env import DT, HOME_TCP, SimEnv
from .expert import V_MAX, ScriptedExpert, _step_toward, natural_yaw
from .program import parse_program
from .scene import ARM_JOINTS, FINGER_JOINTS

MODES = ("scripted", "policy", "replay", "gr00t")
CAMERA_HZ = 5
GR00T_SECONDS_PER_TASK = 20.0


class Runner:
    def __init__(self, program, mode: str = "scripted", seed: int = 0, policy_path=None,
                 human_path=None, gr00t_url: str | None = None, max_seconds: float | None = None,
                 gr00t_requery: int = 8, camera_hz: int = CAMERA_HZ):
        if mode not in MODES:
            raise ValueError(f"mode must be one of {MODES}, got {mode!r}")
        if mode == "policy" and not policy_path:
            raise ValueError("policy mode needs policy_path (train a policy first)")
        if mode == "policy":
            from .policy import check_program
            check_program(policy_path, program)
        if mode == "replay" and human_path is None:
            raise ValueError("replay mode needs human_path (the expert's wrist path)")
        self.program = program
        self.layout = parse_program(program)
        self.mode = mode
        self.seed = int(seed)
        self.policy_path = policy_path
        self.human_path = human_path
        self.gr00t_url = gr00t_url
        self.max_seconds = max_seconds
        self.gr00t_requery = gr00t_requery
        self.camera_every = max(1, round(30 / camera_hz))
        self._stop = threading.Event()
        self.result: dict | None = None
        self.gr00t_calls: list[dict] = []

    # ------------------------------------------------------------------ public

    def frames(self, realtime: bool = True) -> Iterator[dict]:
        q: queue.Queue = queue.Queue(maxsize=90)
        sentinel = object()

        def produce():
            try:
                for msg in self._run(realtime=realtime, stream=True):
                    while not self._stop.is_set():
                        try:
                            q.put(msg, timeout=0.2)
                            break
                        except queue.Full:
                            continue
                    if self._stop.is_set():
                        break
            except Exception as e:  # surfaced to the consumer as a done message
                q.put({"type": "done", "success": False, "reason": f"sim error: {type(e).__name__}: {e}"})
            finally:
                q.put(sentinel)

        th = threading.Thread(target=produce, name=f"tacit-sim-{self.mode}", daemon=True)
        th.start()
        try:
            while True:
                msg = q.get()
                if msg is sentinel:
                    break
                yield msg
        finally:
            self._stop.set()
            th.join(timeout=5)

    def run_episode(self, on_step=None) -> dict:
        """Run to the end without pacing or camera streaming. Returns {success, steps, reason}.

        `on_step(env)` (optional) is called after every control step on the simulation's thread,
        so it may render (e.g. evidence videos).
        """
        if self.mode == "gr00t":
            # GR00T needs rendering, which must stay on one thread: run on a fresh one.
            box: dict = {}

            def work():
                try:
                    box["r"] = self._episode_blocking(on_step)
                except BaseException as e:  # re-raised on the caller's thread
                    box["e"] = e

            th = threading.Thread(target=work, daemon=True)
            th.start()
            th.join()
            if "e" in box:
                raise box["e"]
            return box["r"]
        return self._episode_blocking(on_step)

    def stop(self) -> None:
        self._stop.set()

    # ------------------------------------------------------------------ internals

    def _episode_blocking(self, on_step=None) -> dict:
        for _ in self._run(realtime=False, stream=False, on_step=on_step):
            pass
        return self.result

    def _run(self, realtime: bool, stream: bool, on_step=None):
        env = SimEnv(self.program, seed=self.seed)
        layout = env.layout
        cams = None
        ctrl = None
        follower = None
        gr = None
        client = None
        limit = max_steps(layout)
        try:
            if self.mode == "scripted":
                ctrl = ScriptedExpert(env)
            elif self.mode == "policy":
                from .policy import PolicyController
                ctrl = PolicyController(self.policy_path)
            elif self.mode == "replay":
                from .retarget import PathFollower, retarget_wrist_path
                hp = self.human_path
                if isinstance(hp, dict) and "points" in hp and "scale" in hp:
                    path = hp            # already retargeted
                elif isinstance(hp, dict):
                    path = retarget_wrist_path(hp["points"], hp["times"], hp.get("grip"))
                else:
                    raise ValueError("human_path must be a dict with points and times")
                follower = PathFollower(path)
                limit = int((follower.duration + 4.0) / DT)
            elif self.mode == "gr00t":
                from .gr00t import Gr00tClient, Gr00tController
                from .render import Cameras
                cams = Cameras(env.model)
                client = Gr00tClient(self.gr00t_url)
                Gr00tController.start_pose(env)
                gr = Gr00tController(env, client, cams, requery=self.gr00t_requery, seed=42,
                                     instruction_fn=lambda: instruction(layout, env.monitor.index)
                                     if env.monitor.task is not None else "Go back to the start")
                secs = self.max_seconds or GR00T_SECONDS_PER_TASK * max(1, len(layout.tasks))
                limit = int(secs / DT)
            if self.max_seconds and self.mode != "gr00t":
                limit = int(self.max_seconds / DT)

            if stream:
                meta = {
                    "type": "meta", "mode": self.mode, "seed": self.seed,
                    "joints": ARM_JOINTS + FINGER_JOINTS,
                    "objects": [o.name for o in layout.objects],
                    "targets": [t.name for t in layout.targets],
                    "dt": round(DT, 6),
                    "instruction": instruction(layout),
                }
                if follower is not None:
                    # The path the robot follows; its times start at the first "replay" state.
                    meta["human"] = {k: path.get(k) for k in ("times", "points", "grip", "transform")}
                yield meta
                yield self._state(env, self._phase(env, follower))
            wall0 = time.perf_counter()
            done_steps = 0
            reason = None
            success = False
            for k in range(limit):
                if self._stop.is_set():
                    reason = "stopped"
                    break
                if self.mode in ("scripted", "policy"):
                    if self.mode == "scripted":
                        a = ctrl.act()
                        env.step_ee(a.pos, a.yaw, a.grip)
                    else:
                        pos, yaw, grip = ctrl.act(env)
                        env.step_ee(pos, yaw, grip)
                elif self.mode == "replay":
                    if follower.t0 is None:
                        # Approach the path's first point, then play the path at its own timing.
                        start, _ = follower.target(0.0)
                        env.step_ee(_step_toward(env.tcp_pos(), start, V_MAX), natural_yaw(start), 0.0)
                        if np.linalg.norm(env.tcp_pos() - start) < 0.01:
                            follower.t0 = env.t
                    else:
                        want, grip = follower.target(env.t + DT - follower.t0)
                        env.step_ee(want, natural_yaw(want), grip)
                        follower.errors.append(float(np.linalg.norm(env.tcp_pos() - want)))
                else:
                    info = gr.step()
                    if info is not None:
                        self.gr00t_calls.append(info)
                        if stream:
                            yield {"type": "gr00t", **info}
                if stream:
                    yield self._state(env, self._phase(env, follower))
                    if self.mode == "gr00t" and k % self.camera_every == 0:
                        f = gr.frame(env.steps)
                        from .render import jpeg_b64
                        for name in ("exterior", "wrist"):
                            yield {"type": "camera", "name": name, "t": round(env.t, 4),
                                   "jpeg": jpeg_b64(f[name], 80)}
                if on_step is not None:
                    on_step(env)
                if realtime:
                    lag = wall0 + env.t - time.perf_counter()
                    if lag > 0:
                        time.sleep(lag)

                dropped = [o.name for o in layout.objects if env.object_state(o.name).pos[2] < -0.05]
                if dropped and self.mode != "replay":
                    reason = f"dropped the {dropped[0]} off the table"
                    break
                if self.mode == "replay":
                    if follower.t0 is not None and env.t - follower.t0 >= follower.duration + 0.3:
                        break
                    continue
                if env.monitor.phase == "done":
                    done_steps += 1
                    if self.mode == "gr00t" or np.linalg.norm(env.tcp_pos() - HOME_TCP) < 0.03 or done_steps > 45:
                        break
            else:
                if self.mode != "replay":
                    reason = f"timed out during {env.monitor.label}"
                elif follower.t0 is None:
                    reason = "could not reach the start of the path"

            if self.mode == "replay":
                err = float(np.mean(follower.errors)) if follower.errors else 0.0
                success = reason is None and err < 0.025
                if reason is None and not success:
                    reason = f"tracking error {err * 100:.1f} cm"
            else:
                success = env.success()
                if success:
                    reason = None
                elif reason is None:
                    bad = [t for t in env.final_tasks() if not env.in_target(t)]
                    reason = (f"the {bad[0].object} is not in the {bad[0].target}" if bad and bad[0].target
                              else "did not finish the program")
            self.result = {"success": bool(success), "steps": env.steps, "reason": reason,
                           "seconds": round(env.t, 3), "regrasps": env.monitor.regrasps,
                           "tasks_done": len(env.monitor.completed)}
            if self.mode == "gr00t":
                ms = [c["ms"] for c in self.gr00t_calls]
                self.result["gr00t"] = {"calls": len(ms),
                                        "p50_ms": round(float(np.median(ms)), 1) if ms else None,
                                        "max_ms": round(float(np.max(ms)), 1) if ms else None}
            if self.mode == "replay":
                self.result["tracking_error_m"] = round(float(np.mean(follower.errors)), 4) if follower.errors else None
            if stream:
                yield {"type": "done", **self.result}
        finally:
            if cams is not None:
                cams.close()
            if client is not None:
                client.close()

    @staticmethod
    def _phase(env: SimEnv, follower) -> str:
        if follower is not None:
            return "approach" if follower.t0 is None else "replay"
        return env.monitor.label

    @staticmethod
    def _state(env: SimEnv, phase: str) -> dict:
        q = env.qpos9()
        return {
            "type": "state",
            "t": round(env.t, 4),
            "qpos": [round(float(v), 5) for v in q],
            "objects": env.object_poses(),
            "ee": [round(float(v), 4) for v in env.tcp_pos()],
            "gripper": round(float(np.mean(q[7:9])), 5),
            "phase": phase,
        }


def run_episode(program, mode: str = "scripted", seed: int = 0, policy_path=None, human_path=None,
                gr00t_url: str | None = None, on_step=None, **kw) -> dict:
    return Runner(program, mode, seed, policy_path, human_path, gr00t_url, **kw).run_episode(on_step)


def evaluate_policy(program, policy_path, trials: int = 20, seed: int = 0, on_trial=None) -> dict:
    """Run the policy on `trials` randomised scenes (seeds seed .. seed + trials - 1).

    `on_trial(i, trials, result)` is called after each trial. Returns
    {success_rate, trials: [{seed, success, steps, reason}]}. Raises ProgramMismatch if the
    policy was trained on a different program.
    """
    from .policy import check_program

    check_program(policy_path, program)
    t0 = time.time()
    out = []
    for i in range(trials):
        r = run_episode(program, "policy", seed + i, policy_path=policy_path)
        row = {"seed": seed + i, "success": r["success"], "steps": r["steps"], "reason": r["reason"]}
        out.append(row)
        if on_trial:
            on_trial(i, trials, row)
    rate = sum(r["success"] for r in out) / max(1, trials)
    return {"success_rate": round(rate, 4), "trials": out, "seconds": round(time.time() - t0, 2)}
