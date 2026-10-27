import { useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '@/lib/api'
import { handLocal, placeHand } from '@/lib/handModel'
import { clamp, lerp, smoothstep } from '@/lib/geometry'
import { HOME, solveIK, type V3 } from './franka'
import { FrankaArm } from './FrankaArm'
import { GhostHand } from './GhostHand'

export type HeroFocus = 'watch' | 'check' | 'teach' | 'do' | 'earn' | null

const PERIOD = 7
const HAND_SCALE = 1.75
const BIN_L: Vec3 = [-0.5, 0, 0.1]
const TRAY_L: Vec3 = [-0.2, 0, -0.12]
const ROBOT_BASE: Vec3 = [0.84, 0, -0.02]
const HAND_YAW = Math.PI + 0.3
const HAND_PITCH = 0.6

// Keys are for the grasp point (between thumb and index tips), so the part sits exactly there.
interface Key {
  t: number
  p: Vec3
  curl: number
}
const REST_G: Vec3 = [-0.36, 0.16, 0.2]
const KEYS: Key[] = [
  { t: 0, p: REST_G, curl: 0.25 },
  { t: 0.6, p: REST_G, curl: 0.25 },
  { t: 1.8, p: [BIN_L[0], 0.17, BIN_L[2]], curl: 0.05 },
  { t: 2.4, p: [BIN_L[0], 0.035, BIN_L[2]], curl: 0.1 },
  { t: 2.9, p: [BIN_L[0], 0.035, BIN_L[2]], curl: 0.75 },
  { t: 3.6, p: [BIN_L[0], 0.2, BIN_L[2]], curl: 0.75 },
  { t: 5.0, p: [TRAY_L[0], 0.17, TRAY_L[2]], curl: 0.75 },
  { t: 5.5, p: [TRAY_L[0], 0.04, TRAY_L[2]], curl: 0.75 },
  { t: 5.9, p: [TRAY_L[0], 0.04, TRAY_L[2]], curl: 0.12 },
  { t: 7.0, p: REST_G, curl: 0.25 },
]

function sample(t: number) {
  const tt = ((t % PERIOD) + PERIOD) % PERIOD
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= tt) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const u = smoothstep((tt - a.t) / (b.t - a.t))
  return {
    p: [lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u), lerp(a.p[2], b.p[2], u)] as Vec3,
    curl: lerp(a.curl, b.curl, u),
    held: tt > 2.75 && tt < 5.75,
    placed: tt >= 5.75,
    tt,
  }
}

/** Hand landmarks whose grasp point lands on `g`. */
function handAt(g: Vec3, curl: number, mirror: number, yaw: number, pitch: number): Vec3[] {
  const local = handLocal(curl, mirror).map((p) => p.map((v) => v * HAND_SCALE) as Vec3)
  const placed = placeHand(local, [0, 0, 0], yaw, pitch)
  const gp = [0, 1, 2].map((k) => (placed[4][k] + placed[8][k]) / 2)
  return placed.map((p) => [p[0] + g[0] - gp[0], p[1] + g[1] - gp[1], p[2] + g[2] - gp[2]] as Vec3)
}

/** Three.js world point to the robot's base frame (robot faces -x in the world, z up). */
function toRobot(p: Vec3): V3 {
  return [ROBOT_BASE[0] - p[0], p[2], p[1]]
}

function makeCloud(n: number) {
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 3)
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const boxes: [Vec3, Vec3, THREE.Color][] = [
    [BIN_L, [0.18, 0.09, 0.15], new THREE.Color('#3d6fc0')],
    [[-BIN_L[0], 0, BIN_L[2]], [0.18, 0.09, 0.15], new THREE.Color('#3d6fc0')],
    [TRAY_L, [0.16, 0.025, 0.14], new THREE.Color('#9aa4b0')],
    [[-TRAY_L[0], 0, TRAY_L[2]], [0.16, 0.025, 0.14], new THREE.Color('#9aa4b0')],
  ]
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    let p: Vec3
    if (rnd() < 0.62) {
      p = [lerp(-0.78, 0.78, rnd()), 0.001, lerp(-0.38, 0.38, rnd())]
      c.set('#3cd7ff').multiplyScalar(0.25 + 0.25 * rnd())
    } else {
      const [ctr, s, col0] = boxes[Math.floor(rnd() * boxes.length)]
      const face = Math.floor(rnd() * 3)
      const u = rnd() - 0.5
      const v = rnd() - 0.5
      const side = rnd() < 0.5 ? -0.5 : 0.5
      const l: Vec3 = face === 0 ? [side, u + 0.5, v] : face === 1 ? [u, 1, v] : [u, v + 0.5, side]
      p = [ctr[0] + l[0] * s[0], l[1] * s[1], ctr[2] + l[2] * s[2]]
      c.copy(col0).multiplyScalar(0.6 + 0.5 * rnd())
    }
    pos.set(p, i * 3)
    col.set([c.r, c.g, c.b], i * 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

function Bin({ pos, color }: { pos: Vec3; color: string }) {
  const w = 0.18
  const d = 0.15
  const h = 0.09
  const t = 0.006
  return (
    <group position={[pos[0], h / 2, pos[2]]}>
      {[
        [0, -h / 2 + t / 2, 0, w, t, d],
        [-w / 2, 0, 0, t, h, d],
        [w / 2, 0, 0, t, h, d],
        [0, 0, -d / 2, w, h, t],
        [0, 0, d / 2, w, h, t],
      ].map(([x, y, z, sx, sy, sz], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0.05} />
        </mesh>
      ))}
    </group>
  )
}

function Tray({ pos, glow }: { pos: Vec3; glow?: MutableRefObject<number> }) {
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (ring.current && glow) ring.current.opacity = 0.1 + 0.8 * glow.current
  })
  return (
    <group position={[pos[0], 0.012, pos[2]]}>
      <mesh>
        <boxGeometry args={[0.16, 0.024, 0.14]} />
        <meshStandardMaterial color="#3a4048" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.0125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.12, 0.1]} />
        <meshStandardMaterial color="#20252b" roughness={0.9} />
      </mesh>
      {glow && (
        <mesh position={[0, -0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.12, 0.13, 48]} />
          <meshBasicMaterial ref={ring} color="#ffc857" transparent opacity={0.2} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

function Scene({ focus, frozen }: { focus: HeroFocus; frozen: boolean }) {
  const handA = useRef<Vec3[] | null>(null)
  const handB = useRef<Vec3[] | null>(null)
  const q = useRef<number[]>([...HOME, 0.04])
  const partHand = useRef<THREE.Mesh>(null)
  const partRobot = useRef<THREE.Mesh>(null)
  const beam = useRef<THREE.InstancedMesh>(null)
  const cloudMat = useRef<THREE.PointsMaterial>(null)
  const scan = useRef<THREE.Mesh>(null)
  const trail = useRef<THREE.Line>(null)
  const time = useRef(frozen ? 3.3 : 0)
  const glow = useRef(0.6)
  const handGlow = useRef(0.7)
  const earnGlow = useRef(0)
  const cloudAmt = useRef(0.18)
  const beamAmt = useRef(0.6)
  const cloud = useMemo(() => makeCloud(7000), [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), v: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), [])
  const trailGeo = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 80; i++) {
      const s = sample(0.6 + (i / 80) * 6.4)
      pts.push(new THREE.Vector3(s.p[0], s.p[1], s.p[2]))
    }
    return new THREE.BufferGeometry().setFromPoints(pts)
  }, [])
  const robotBasis = useMemo(() => {
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))
    m.setPosition(...ROBOT_BASE)
    return m
  }, [])

  useFrame((_, dt) => {
    if (!frozen) time.current += Math.min(dt, 0.05)
    const s = sample(time.current)
    // Working hand (left of the table) and a steadying hand by the tray.
    handA.current = handAt(s.p, s.curl, 1, HAND_YAW, HAND_PITCH)
    const bob = frozen ? 0 : 0.004 * Math.sin(time.current * 1.3)
    handB.current = handAt([-0.08, 0.03 + bob, -0.2], 0.35, -1, Math.PI - 0.55, 0.5)

    // The robot mirrors the working hand across the table centre.
    const mirrored: Vec3 = [-s.p[0], Math.max(0.025, s.p[1]), s.p[2]]
    const sol = solveIK(toRobot(mirrored), q.current, frozen ? 120 : 10, Math.PI / 2)
    const grip = s.held ? 0.012 : 0.04
    q.current = [...sol, lerp(q.current[7] ?? 0.04, grip, 0.25)]

    const k = (target: number, ref: MutableRefObject<number>, rate = 0.08) => {
      ref.current += (target - ref.current) * rate
    }
    k(focus === 'do' ? 1 : 0.55, glow)
    k(focus === 'watch' ? 1.4 : focus ? 0.55 : 0.85, handGlow)
    k(focus === 'check' ? 0.95 : 0.16, cloudAmt)
    k(focus === 'do' || focus === 'watch' ? 1 : focus ? 0.25 : 0.6, beamAmt)
    k(focus === 'earn' ? 1 : 0, earnGlow)

    // Parts: a ghost copy in the hand, a solid one in the gripper.
    if (partHand.current) {
      if (s.held) partHand.current.position.set(s.p[0], s.p[1] - 0.008, s.p[2])
      else if (s.placed) partHand.current.position.set(TRAY_L[0], 0.04, TRAY_L[2])
      else partHand.current.position.set(BIN_L[0], 0.03, BIN_L[2])
    }
    if (partRobot.current) {
      if (s.held) partRobot.current.position.set(mirrored[0], mirrored[1] - 0.008, mirrored[2])
      else if (s.placed) partRobot.current.position.set(-TRAY_L[0], 0.04, TRAY_L[2])
      else partRobot.current.position.set(-BIN_L[0], 0.03, BIN_L[2])
    }

    // Retarget beam: particles flowing from the wrist to the gripper along an arc.
    if (beam.current) {
      const a = new THREE.Vector3(s.p[0], s.p[1] + 0.06, s.p[2])
      const b = new THREE.Vector3(mirrored[0], mirrored[1] + 0.06, mirrored[2])
      const n = beam.current.count
      for (let i = 0; i < n; i++) {
        const u = (i / n + time.current * 0.35) % 1
        tmp.v.lerpVectors(a, b, u)
        tmp.v.y += Math.sin(u * Math.PI) * 0.16
        const sc = (0.5 + Math.sin(u * Math.PI) * 0.9) * beamAmt.current
        tmp.m.compose(tmp.v, tmp.q.identity(), tmp.s.setScalar(sc))
        beam.current.setMatrixAt(i, tmp.m)
      }
      beam.current.instanceMatrix.needsUpdate = true
    }
    if (cloudMat.current) cloudMat.current.opacity = cloudAmt.current
    if (scan.current) {
      const m = scan.current.material as THREE.MeshBasicMaterial
      m.opacity = clamp((cloudAmt.current - 0.2) * 0.5, 0, 0.35)
      scan.current.position.z = -0.38 + ((time.current * 0.22) % 1) * 0.76
    }
    if (trail.current) {
      const m = trail.current.material as THREE.LineDashedMaterial
      m.opacity = focus === 'teach' ? 0.9 : 0.12
    }
  })

  const trailLine = useMemo(() => {
    const l = new THREE.Line(trailGeo, new THREE.LineDashedMaterial({ color: '#ffc857', dashSize: 0.015, gapSize: 0.012, transparent: true, opacity: 0.12 }))
    l.computeLineDistances()
    return l
  }, [trailGeo])

  return (
    <>
      <color attach="background" args={['#0a0c0e']} />
      <fog attach="fog" args={['#0a0c0e', 2.6, 5]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[1.5, 2.5, 2]} intensity={1.6} />
      <directionalLight position={[-2, 1.2, -1.5]} intensity={0.9} color="#3cd7ff" />
      <pointLight position={[0.6, 0.8, 0.6]} intensity={0.8} color="#bfefff" />

      {/* table */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[2.1, 0.04, 0.9]} />
        <meshStandardMaterial color="#14181c" roughness={0.85} metalness={0.1} />
      </mesh>
      <gridHelper args={[2.1, 42, '#1f3a44', '#152228']} position={[0, 0.0005, 0]} scale={[1, 1, 0.9 / 2.1]} />
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.004, 0.88]} />
        <meshBasicMaterial color="#3cd7ff" transparent opacity={0.35} toneMapped={false} />
      </mesh>

      <Bin pos={BIN_L} color="#2b4f86" />
      <Bin pos={[-BIN_L[0], 0, BIN_L[2]]} color="#2b4f86" />
      <Tray pos={TRAY_L} />
      <Tray pos={[-TRAY_L[0], 0, TRAY_L[2]]} glow={earnGlow} />

      <mesh ref={partHand}>
        <boxGeometry args={[0.05, 0.016, 0.03]} />
        <meshBasicMaterial color="#3cd7ff" transparent opacity={0.55} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={partRobot}>
        <boxGeometry args={[0.05, 0.016, 0.03]} />
        <meshStandardMaterial color="#e8ecf0" roughness={0.3} metalness={0.6} />
      </mesh>

      <GhostHand points={handA} intensity={handGlow} jointScale={1.6} />
      <GhostHand points={handB} intensity={handGlow} jointScale={1.6} color="#7fdcff" />
      <primitive object={trailLine} ref={trail} />

      <group matrixAutoUpdate={false} matrix={robotBasis}>
        <FrankaArm q={q} glow={glow} />
      </group>

      <instancedMesh ref={beam} args={[undefined, undefined, 18]} frustumCulled={false}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshBasicMaterial color="#8be9ff" transparent opacity={0.9} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>

      <points geometry={cloud}>
        <pointsMaterial ref={cloudMat} size={0.006} vertexColors transparent opacity={0.18} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <mesh ref={scan} rotation={[0, 0, 0]} position={[0, 0.12, 0]}>
        <planeGeometry args={[1.6, 0.26]} />
        <meshBasicMaterial color="#3cd7ff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </>
  )
}

export interface HotspotDef {
  key: Exclude<HeroFocus, null>
  label: string
  pos: Vec3
}

export const HOTSPOTS: HotspotDef[] = [
  { key: 'watch', label: 'Watch', pos: [-0.42, 0.36, 0.18] },
  { key: 'check', label: 'Check', pos: [-0.7, 0.06, -0.3] },
  { key: 'teach', label: 'Teach', pos: [-0.2, 0.1, -0.13] },
  { key: 'do', label: 'Do', pos: [0.72, 0.62, -0.02] },
  { key: 'earn', label: 'Earn', pos: [0.2, 0.1, -0.13] },
]

export function HeroCanvas({
  focus,
  frozen,
  renderHotspot,
}: {
  focus: HeroFocus
  frozen: boolean
  renderHotspot: (h: HotspotDef) => React.ReactNode
}) {
  return (
    <Canvas
      camera={{ position: [0.12, 1.02, 1.9], fov: 34, near: 0.05, far: 12 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      frameloop={frozen ? 'demand' : 'always'}
      onCreated={({ camera }) => camera.lookAt(0.14, 0.2, -0.04)}
      data-testid="hero-canvas"
    >
      <Scene focus={focus} frozen={frozen} />
      {HOTSPOTS.map((h) => (
        <Html key={h.key} position={h.pos} center zIndexRange={[20, 0]}>
          {renderHotspot(h)}
        </Html>
      ))}
    </Canvas>
  )
}
