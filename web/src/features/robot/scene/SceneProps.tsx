import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { SimObject, SimScene, SimStatic, SimTarget } from '@/lib/api/robot'
import type { Pose } from '../runStream'
import { quat, rgbaColor } from './frames'

// Everything here sits inside the z-up root group, in MuJoCo coordinates.

const TABLE_TOP = new THREE.MeshStandardMaterial({ color: '#171b20', roughness: 0.82, metalness: 0.05 })
const TABLE_EDGE = new THREE.MeshStandardMaterial({ color: '#0d1013', roughness: 0.6, metalness: 0.2 })
const LEG = new THREE.MeshStandardMaterial({ color: '#1d2228', roughness: 0.5, metalness: 0.6 })

export function Table({ body }: { body: SimStatic }) {
  const [sx, sy, sz] = body.size
  const [x, y, z] = body.pos
  const legH = body.legs_height ?? 0.76
  const legs = useMemo(() => {
    const ix = sx / 2 - 0.05
    const iy = sy / 2 - 0.05
    return [
      [x - ix, y - iy],
      [x + ix, y - iy],
      [x - ix, y + iy],
      [x + ix, y + iy],
    ]
  }, [sx, sy, x, y])
  const top = z + sz / 2
  return (
    <group>
      <mesh position={[x, y, z]} receiveShadow material={TABLE_EDGE}>
        <boxGeometry args={[sx, sy, sz]} />
      </mesh>
      <mesh position={[x, y, top + 0.0004]} receiveShadow material={TABLE_TOP}>
        <planeGeometry args={[sx - 0.006, sy - 0.006]} />
      </mesh>
      <TableGrid size={[sx - 0.02, sy - 0.02]} center={[x, y, top + 0.0012]} />
      {legs.map(([lx, ly], i) => (
        <mesh key={i} position={[lx, ly, top - sz - (legH - sz) / 2]} material={LEG} castShadow>
          <boxGeometry args={[0.04, 0.04, legH - sz]} />
        </mesh>
      ))}
    </group>
  )
}

/** A fine 5 cm grid on the table top, as line segments (crisper than a texture at grazing angles). */
function TableGrid({ size, center }: { size: [number, number]; center: [number, number, number] }) {
  const geo = useMemo(() => {
    const [w, h] = size
    const pts: number[] = []
    const step = 0.05
    for (let gx = -Math.floor(w / 2 / step) * step; gx <= w / 2 + 1e-6; gx += step) pts.push(gx, -h / 2, 0, gx, h / 2, 0)
    for (let gy = -Math.floor(h / 2 / step) * step; gy <= h / 2 + 1e-6; gy += step) pts.push(-w / 2, gy, 0, w / 2, gy, 0)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [size])
  return (
    <lineSegments geometry={geo} position={center}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.045} depthWrite={false} />
    </lineSegments>
  )
}

/** The rectangle the sim randomises object start positions in (the "variations"). */
export function SpawnRegion({ spawn, z = 0.0016, emphasis = 0 }: { spawn: NonNullable<SimScene['spawn']>; z?: number; emphasis?: number }) {
  const [x0, x1] = spawn.x
  const [y0, y1] = spawn.y
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x0, y0, z),
      new THREE.Vector3(x1, y0, z),
      new THREE.Vector3(x1, y1, z),
      new THREE.Vector3(x0, y1, z),
      new THREE.Vector3(x0, y0, z),
    ])
    return g
  }, [x0, x1, y0, y1, z])
  const mat = useMemo(() => new THREE.LineDashedMaterial({ color: '#3cd7ff', dashSize: 0.012, gapSize: 0.008, transparent: true, opacity: 0.35 }), [])
  const obj = useMemo(() => new THREE.Line(line, mat).computeLineDistances(), [line, mat])
  mat.opacity = 0.28 + 0.4 * emphasis
  return (
    <group>
      <primitive object={obj} />
      <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, z - 0.0002]}>
        <planeGeometry args={[x1 - x0, y1 - y0]} />
        <meshBasicMaterial color="#3cd7ff" transparent opacity={0.025 + 0.05 * emphasis} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function Bin({ target, label }: { target: SimTarget; label: boolean }) {
  const [ox, oy, oh] = target.outer_size ?? [0.15, 0.15, 0.045]
  const wall = target.wall ?? 0.006
  const floor = target.floor ?? 0.008
  const h = target.height ?? oh
  const color = useMemo(() => rgbaColor(target.rgba, '#6b6f76'), [target.rgba])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }), [color])
  const [x, y, z] = target.pos
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0, floor / 2]} material={mat} receiveShadow castShadow>
        <boxGeometry args={[ox, oy, floor]} />
      </mesh>
      {[
        [0, (oy - wall) / 2, ox, wall],
        [0, -(oy - wall) / 2, ox, wall],
        [(ox - wall) / 2, 0, wall, oy],
        [-(ox - wall) / 2, 0, wall, oy],
      ].map(([px, py, sx, sy], i) => (
        <mesh key={i} position={[px, py, h / 2]} material={mat} castShadow receiveShadow>
          <boxGeometry args={[sx, sy, h]} />
        </mesh>
      ))}
      {label && <SceneLabel position={[0, -oy / 2 - 0.02, 0.005]} text={target.name} kind="target" />}
    </group>
  )
}

/** Program objects, moved every frame from the interpolated stream (or their start pose). */
export function SimObjects({ objects, pose, labels }: { objects: SimObject[]; pose: MutableRefObject<Pose>; labels: boolean }) {
  const refs = useRef(new Map<string, THREE.Group>())
  const tmp = useMemo(() => new THREE.Quaternion(), [])
  useFrame(() => {
    for (const o of objects) {
      const g = refs.current.get(o.name)
      if (!g) continue
      const p = pose.current.objects.get(o.name)
      if (p) {
        g.position.set(p.pos[0], p.pos[1], p.pos[2])
        g.quaternion.copy(tmp.set(p.quat[1], p.quat[2], p.quat[3], p.quat[0]))
      } else {
        g.position.set(o.pos[0], o.pos[1], o.pos[2])
        g.quaternion.copy(quat(o.quat))
      }
    }
  })
  return (
    <>
      {objects.map((o) => (
        <group
          key={o.name}
          ref={(el) => {
            if (el) refs.current.set(o.name, el)
            else refs.current.delete(o.name)
          }}
        >
          <ObjectMesh obj={o} />
          {labels && <SceneLabel position={[0, 0, (o.shape === 'cylinder' ? o.size[1] : (o.size[2] ?? 0.04)) / 2 + 0.03]} text={o.name} kind="object" />}
        </group>
      ))}
    </>
  )
}

function ObjectMesh({ obj }: { obj: SimObject }) {
  const color = useMemo(() => rgbaColor(obj.rgba, '#d5dae0'), [obj.rgba])
  if (obj.shape === 'cylinder') {
    const [d, h] = obj.size
    return (
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[d / 2, d / 2, h, 32]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} />
      </mesh>
    )
  }
  const [sx, sy, sz] = obj.size
  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={[sx, sy, sz ?? sx]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} />
    </mesh>
  )
}

export function SceneLabel({ position, text, kind }: { position: [number, number, number]; text: string; kind: 'object' | 'target' }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <span
        className={
          'telemetry block whitespace-nowrap rounded-xs px-1.5 py-px text-[10px] backdrop-blur-sm ' +
          (kind === 'object' ? 'bg-ink-900/70 text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)]' : 'bg-ink-900/60 text-fg-muted shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]')
        }
      >
        {text}
      </span>
    </Html>
  )
}
