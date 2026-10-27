import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vec3 } from '@/lib/api'
import type { SimCamera } from '@/lib/api/robot'
import { GhostHand } from '@/three/GhostHand'
import { runBuffer, useRunUi, type Pose } from '../runStream'
import { ghostAt, type GhostTrack } from '../retarget'
import { quat } from './frames'

const TRAIL_SECONDS = 2.4
const TRAIL_MAX = 96

/** A fading line behind the gripper: the last few seconds of the TCP, from the state buffer. */
export function TcpTrail({ pose, color = '#3cd7ff' }: { pose: MutableRefObject<Pose>; color?: string }) {
  const { geo, line } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3))
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const l = new THREE.Line(g, m)
    l.frustumCulled = false
    return { geo: g, line: l }
  }, [])
  const base = useMemo(() => new THREE.Color(color), [color])
  useFrame(() => {
    const s = runBuffer.states
    const t = pose.current.t
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const col = geo.getAttribute('color') as THREE.BufferAttribute
    if (!s.length) {
      geo.setDrawRange(0, 0)
      return
    }
    // walk back from the current time
    let hi = s.length - 1
    while (hi > 0 && s[hi].t > t) hi--
    let n = 0
    const stride = Math.max(1, Math.ceil(((TRAIL_SECONDS * 30) | 0) / TRAIL_MAX))
    for (let i = hi; i >= 0 && n < TRAIL_MAX - 1; i -= stride) {
      if (t - s[i].t > TRAIL_SECONDS) break
      const age = (t - s[i].t) / TRAIL_SECONDS
      const k = (1 - age) ** 1.6
      pos.setXYZ(n, s[i].ee[0], s[i].ee[1], s[i].ee[2])
      col.setXYZ(n, base.r * k, base.g * k, base.b * k)
      n++
    }
    if (n) {
      // join the trail to the interpolated gripper so it never lags a frame behind
      ;(pos.array as Float32Array).copyWithin(3, 0, n * 3)
      ;(col.array as Float32Array).copyWithin(3, 0, n * 3)
      pos.setXYZ(0, pose.current.ee[0], pose.current.ee[1], pose.current.ee[2])
      col.setXYZ(0, base.r, base.g, base.b)
      n++
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    geo.setDrawRange(0, n)
  })
  return <primitive object={line} />
}

/** The expert's wrist path in the workspace: dim ahead, bright where the robot has been. */
export function HumanPath({ points, progress }: { points: Vec3[]; progress: MutableRefObject<number> }) {
  const { ahead, done, doneGeo } = useMemo(() => {
    const flat = new Float32Array(points.flatMap((p) => p))
    const g1 = new THREE.BufferGeometry()
    g1.setAttribute('position', new THREE.BufferAttribute(flat, 3))
    const g2 = new THREE.BufferGeometry()
    g2.setAttribute('position', new THREE.BufferAttribute(flat.slice(), 3))
    const a = new THREE.Line(g1, new THREE.LineDashedMaterial({ color: '#a78bfa', dashSize: 0.008, gapSize: 0.006, transparent: true, opacity: 0.55, depthWrite: false }))
    a.computeLineDistances()
    const d = new THREE.Line(g2, new THREE.LineBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    a.frustumCulled = d.frustumCulled = false
    return { ahead: a, done: d, doneGeo: g2 }
  }, [points])
  useFrame(() => {
    doneGeo.setDrawRange(0, Math.max(0, Math.min(points.length, Math.round(progress.current * points.length))))
  })
  return (
    <group>
      <primitive object={ahead} />
      <primitive object={done} />
    </group>
  )
}

/**
 * The expert's hands replayed in the robot workspace, in step with the robot: twin time is the
 * path's first tracked frame plus the time since the run entered its "replay" phase.
 */
export function GhostHands({ track, pose, progress }: { track: GhostTrack; pose: MutableRefObject<Pose>; progress: MutableRefObject<number> }) {
  const left = useRef<Vec3[] | null>(null)
  const right = useRef<Vec3[] | null>(null)
  const bufL = useMemo<Vec3[]>(() => [], [])
  const bufR = useMemo<Vec3[]>(() => [], [])
  const glow = useRef(0.6)
  const duration = track.times.length ? track.times[track.times.length - 1] - track.t0 : 0
  useFrame(() => {
    const start = useRunUi.getState().replayStart
    const t = pose.current.t
    const local = start === null ? 0 : Math.max(0, t - start)
    progress.current = duration > 0 ? Math.min(1, local / duration) : 0
    const tt = track.t0 + local
    left.current = ghostAt(track, 'left', tt, bufL)
    right.current = ghostAt(track, 'right', tt, bufR)
    glow.current = start === null ? 0.35 : 0.85
  })
  return (
    <group>
      <GhostHand points={left} color="#3cd7ff" intensity={glow} jointScale={1.25} />
      <GhostHand points={right} color="#a78bfa" intensity={glow} jointScale={1.25} />
    </group>
  )
}

/** A wireframe view frustum for a MuJoCo camera (looks along local -z, +y up, 16:9). */
export function CameraFrustum({ cam, color = '#ffc857', depth = 0.12, aspect = 16 / 9 }: { cam: SimCamera; color?: string; depth?: number; aspect?: number }) {
  const geo = useMemo(() => {
    const h = Math.tan(((cam.fovy ?? 60) * Math.PI) / 360) * depth
    const w = h * aspect
    const c = [
      [-w, -h, -depth],
      [w, -h, -depth],
      [w, h, -depth],
      [-w, h, -depth],
    ]
    const pts: number[] = []
    for (const p of c) pts.push(0, 0, 0, ...p)
    for (let i = 0; i < 4; i++) pts.push(...c[i], ...c[(i + 1) % 4])
    // a small "up" tick so the image orientation reads
    pts.push(-w * 0.3, h, -depth, 0, h * 1.35, -depth, 0, h * 1.35, -depth, w * 0.3, h, -depth)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [cam.fovy, depth, aspect])
  return (
    <group position={cam.pos} quaternion={quat(cam.quat)}>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
      </lineSegments>
      <mesh>
        <sphereGeometry args={[0.008, 12, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}
