import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Twin, TwinFrame, Vec3 } from '@/lib/api'
import { nearestFrame, POSE_CONNECTIONS } from '@/lib/geometry'
import { GhostHand } from '@/three/GhostHand'
import { analyseMotion, type MotionStats } from './motion'

const OBJECT_POOL = 8
const COMET_S = 1.2

interface Cursor {
  /** Index of the frame at the playhead. */
  i: number
  /** Last frame whose body pose was trustworthy (held through glitches). */
  body: Vec3[] | null
  frame: TwinFrame | undefined
}

/** Puts the camera in front of the person, a little to the side and above, looking at the hands. */
function Rig({ stats, controls }: { stats: MotionStats; controls: MutableRefObject<{ target: THREE.Vector3; update: () => void } | null> }) {
  const camera = useThree((s) => s.camera)
  useLayoutEffect(() => {
    const [cx, cy, cz] = stats.center
    const d = Math.max(1.7, stats.width * 6.5)
    const a = 0.55
    const [fx, , fz] = stats.front
    const rx = fx * Math.cos(a) + fz * Math.sin(a)
    const rz = -fx * Math.sin(a) + fz * Math.cos(a)
    const target = new THREE.Vector3(cx, cy - stats.width * 0.45, cz)
    camera.position.set(cx + rx * d, cy + d * 0.22, cz + rz * d)
    camera.lookAt(target)
    if (controls.current) {
      controls.current.target.copy(target)
      controls.current.update()
    }
  }, [camera, stats, controls])
  return null
}

function Body({ cursor }: { cursor: MutableRefObject<Cursor> }) {
  const head = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POSE_CONNECTIONS.length * 6), 3))
    return g
  }, [])
  const lines = useMemo(() => new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#d5dde6', transparent: true, opacity: 0.6 })), [geo])
  useFrame(() => {
    const b = cursor.current.body
    lines.visible = Boolean(b)
    if (head.current) head.current.visible = Boolean(b)
    if (!b) return
    const arr = geo.attributes.position.array as Float32Array
    POSE_CONNECTIONS.forEach(([i, j], k) => {
      arr.set(b[i] ?? b[0], k * 6)
      arr.set(b[j] ?? b[0], k * 6 + 3)
    })
    geo.attributes.position.needsUpdate = true
    geo.computeBoundingSphere()
    if (head.current && b[7] && b[8]) head.current.position.set((b[7][0] + b[8][0]) / 2, (b[7][1] + b[8][1]) / 2, (b[7][2] + b[8][2]) / 2)
  })
  return (
    <group>
      <primitive object={lines} />
      <mesh ref={head}>
        <sphereGeometry args={[0.08, 28, 20]} />
        <meshStandardMaterial color="#9aa6b2" transparent opacity={0.16} roughness={0.5} />
      </mesh>
    </group>
  )
}

/** Wrist paths over the whole skill (faint) plus a bright comet of the last second. */
function Trails({ twin, stats, cursor }: { twin: Twin; stats: MotionStats; cursor: MutableRefObject<Cursor> }) {
  const tracks = useMemo(() => {
    const pick = (side: 'left' | 'right') =>
      twin.frames.map((f, i) => {
        const ok = side === 'left' ? stats.leftOk[i] : stats.rightOk[i]
        if (ok) return f.hands[side]![0]
        if (stats.bodyOk[i] && f.body) return f.body[side === 'left' ? 15 : 16]
        return null
      })
    const smooth = (raw: (Vec3 | null)[]) =>
      raw.map((p, i) => {
        if (!p) return null
        const win = raw.slice(Math.max(0, i - 2), i + 3).filter((x): x is Vec3 => x != null)
        return [0, 1, 2].map((k) => win.reduce((a, x) => a + x[k], 0) / win.length) as Vec3
      })
    return { left: smooth(pick('left')), right: smooth(pick('right')) }
  }, [twin, stats])

  const jump = stats.width * 0.6
  const make = (pts: (Vec3 | null)[], color: string, opacity: number) => {
    const seg: number[] = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < jump) seg.push(...a, ...b)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3))
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
  }
  const ghosts = useMemo(() => [make(tracks.left, '#3cd7ff', 0.16), make(tracks.right, '#a78bfa', 0.16)], [tracks]) // eslint-disable-line react-hooks/exhaustive-deps
  const comets = useMemo(
    () =>
      ['#3cd7ff', '#a78bfa'].map((c) => {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3))
        g.setDrawRange(0, 0)
        return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
      }),
    [],
  )
  const span = Math.max(2, Math.round(COMET_S * (twin.fps || 10)))
  useFrame(() => {
    const i = cursor.current.i
    ;[tracks.left, tracks.right].forEach((pts, side) => {
      const line = comets[side]
      const arr = line.geometry.attributes.position.array as Float32Array
      let n = 0
      for (let k = Math.max(1, i - span); k <= i && n < 64; k++) {
        const a = pts[k - 1]
        const b = pts[k]
        if (a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < jump) {
          arr.set(a, n * 6)
          arr.set(b, n * 6 + 3)
          n++
        }
      }
      line.geometry.setDrawRange(0, n * 2)
      line.geometry.attributes.position.needsUpdate = true
      line.geometry.computeBoundingSphere()
    })
  })
  return (
    <group>
      {ghosts.map((g, i) => (
        <primitive key={`g${i}`} object={g} />
      ))}
      {comets.map((g, i) => (
        <primitive key={`c${i}`} object={g} />
      ))}
    </group>
  )
}

function Gaze({ cursor }: { cursor: MutableRefObject<Cursor> }) {
  const ring = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }, [])
  const line = useMemo(() => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffc857', transparent: true, opacity: 0.75, toneMapped: false })), [geo])
  useFrame(({ clock }) => {
    const g = cursor.current.body ? cursor.current.frame?.gaze : null
    line.visible = Boolean(g)
    if (ring.current) ring.current.visible = Boolean(g)
    if (!g) return
    const arr = geo.attributes.position.array as Float32Array
    arr.set(g.origin, 0)
    arr.set(g.target, 3)
    geo.attributes.position.needsUpdate = true
    geo.computeBoundingSphere()
    if (ring.current) {
      ring.current.position.set(...g.target)
      ring.current.scale.setScalar(1 + 0.2 * Math.sin(clock.elapsedTime * 5))
    }
  })
  return (
    <group>
      <primitive object={line} />
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.022, 0.03, 40]} />
        <meshBasicMaterial color="#ffc857" transparent opacity={0.85} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** A fixed pool of part markers; labels are written straight into the DOM to avoid re-renders. */
function Parts({ cursor }: { cursor: MutableRefObject<Cursor> }) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  useFrame(() => {
    const objs = cursor.current.frame?.objects ?? []
    for (let k = 0; k < OBJECT_POOL; k++) {
      const g = groups.current[k]
      const o = objs[k]
      if (!g) continue
      g.visible = Boolean(o)
      if (!o) continue
      g.position.set(...o.pos)
      const el = labels.current[k]
      if (el && el.textContent !== o.label) el.textContent = o.label
    }
  })
  return (
    <group>
      {Array.from({ length: OBJECT_POOL }, (_, k) => (
        <group key={k} ref={(g) => void (groups.current[k] = g)} visible={false}>
          <mesh>
            <octahedronGeometry args={[0.014]} />
            <meshBasicMaterial color="#7cf5c4" toneMapped={false} />
          </mesh>
          <Html center position={[0, 0.05, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <span ref={(el) => void (labels.current[k] = el)} className="telemetry rounded-sm bg-ink-950/80 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-data-object" />
          </Html>
        </group>
      ))}
    </group>
  )
}

function Scene({ twin, timeRef }: { twin: Twin; timeRef: MutableRefObject<number> }) {
  const stats = useMemo(() => analyseMotion(twin), [twin])
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null)
  const cursor = useRef<Cursor>({ i: 0, body: null, frame: twin.frames[0] })
  const left = useRef<Vec3[] | null>(null)
  const right = useRef<Vec3[] | null>(null)
  const index = useMemo(() => new Map(twin.frames.map((f, i) => [f, i])), [twin])
  useFrame(() => {
    const f = nearestFrame(twin.frames, timeRef.current)
    const i = f ? (index.get(f) ?? 0) : 0
    const c = cursor.current
    c.i = i
    c.frame = f
    if (f?.body && stats.bodyOk[i]) c.body = f.body
    left.current = stats.leftOk[i] ? f!.hands.left : null
    right.current = stats.rightOk[i] ? f!.hands.right : null
  })
  const [cx, , cz] = stats.center
  return (
    <>
      <color attach="background" args={['#07080a']} />
      <fog attach="fog" args={['#07080a', 2.5, 6]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[1, 2, 1]} intensity={1.1} />
      <Rig stats={stats} controls={controls} />
      <gridHelper args={[4, 40, '#1d3038', '#11191d']} position={[cx, stats.floorY, cz]} />
      <mesh position={[cx, stats.floorY + 0.001, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[stats.width * 2.2, 48]} />
        <meshBasicMaterial color="#3cd7ff" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      <Trails twin={twin} stats={stats} cursor={cursor} />
      <Body cursor={cursor} />
      <GhostHand points={left} color="#3cd7ff" jointScale={1.3} />
      <GhostHand points={right} color="#a78bfa" jointScale={1.3} />
      <Gaze cursor={cursor} />
      <Parts cursor={cursor} />
      <OrbitControls
        ref={controls as never}
        enableDamping
        makeDefault
        minDistance={0.4}
        maxDistance={5}
        maxPolarAngle={Math.PI * 0.49}
      />
    </>
  )
}

/** The expert's motion in 3D: body, glowing hands, wrist paths, gaze and parts. No video. */
export function MotionScene({ twin, timeRef, className }: { twin: Twin; timeRef: MutableRefObject<number>; className?: string }) {
  return (
    <div className={className} data-testid="motion-scene">
      <Canvas camera={{ position: [0, 1, 2], fov: 40, near: 0.02, far: 30 }} dpr={[1, 2]}>
        <Scene twin={twin} timeRef={timeRef} />
      </Canvas>
    </div>
  )
}
