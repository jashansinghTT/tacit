import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useQuery } from '@tanstack/react-query'
import * as THREE from 'three'
import type { SimBody, SimRobot } from '@/lib/api/robot'
import type { Pose } from '../runStream'
import { quat } from './frames'

/**
 * The Franka Panda as a group hierarchy mirroring the scene's kinematic tree:
 * body group (pos, quat) > joint group (hinge rotation / slide offset) > visual + child bodies.
 * Each frame only the joint groups change, from the interpolated `qpos`.
 */
export function RobotModel({
  robot,
  pose,
  visual,
  attach,
}: {
  robot: SimRobot
  pose: MutableRefObject<Pose>
  visual: 'glb' | 'primitive'
  /** Extra children per body (for example the wrist camera on `panda_hand`). */
  attach?: Record<string, ReactNode>
}) {
  const joints = useRef(new Map<string, THREE.Group>())
  const kids = useMemo(() => {
    const m = new Map<string | null, SimBody[]>()
    for (const b of robot.bodies) {
      const list = m.get(b.parent) ?? []
      list.push(b)
      m.set(b.parent, list)
    }
    return m
  }, [robot.bodies])
  const axes = useMemo(() => new Map(robot.bodies.filter((b) => b.joint).map((b) => [b.name, new THREE.Vector3(...b.joint!.axis)])), [robot.bodies])

  useFrame(() => {
    const q = pose.current.qpos.length >= robot.joints.length ? pose.current.qpos : (robot.home_qpos ?? [])
    for (const b of robot.bodies) {
      if (!b.joint) continue
      const g = joints.current.get(b.name)
      const axis = axes.get(b.name)
      if (!g || !axis) continue
      const v = q[b.joint.qpos_index] ?? 0
      if (b.joint.type === 'slide') g.position.copy(axis).multiplyScalar(v)
      else g.quaternion.setFromAxisAngle(axis, v)
    }
  })

  const render = (b: SimBody): ReactNode => {
    const children = kids.get(b.name) ?? []
    return (
      <group key={b.name} name={b.name} position={b.pos} quaternion={quat(b.quat)}>
        <group
          ref={(el) => {
            if (el) joints.current.set(b.name, el)
            else joints.current.delete(b.name)
          }}
        >
          {visual === 'glb' && b.mesh ? <GlbLink url={b.mesh} /> : <PrimitiveLink body={b} kids={children} />}
          {attach?.[b.name]}
          {children.map(render)}
        </group>
      </group>
    )
  }
  return <group>{(kids.get(null) ?? []).map(render)}</group>
}

function GlbLink({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const obj = useMemo(() => {
    const o = scene.clone(true)
    o.traverse((n) => {
      const m = n as THREE.Mesh
      if (!m.isMesh) return
      m.castShadow = true
      m.receiveShadow = true
      const mat = m.material as THREE.MeshStandardMaterial
      if (mat?.isMeshStandardMaterial) {
        mat.envMapIntensity = 0.9
        mat.roughness = Math.min(mat.roughness, 0.45)
      }
    })
    return o
  }, [scene])
  return <primitive object={obj} />
}

const PRIM = {
  white: new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.35, metalness: 0.1 }),
  dark: new THREE.MeshStandardMaterial({ color: '#30353c', roughness: 0.5, metalness: 0.35 }),
}

/** Stand-in geometry until the GLB meshes are served: housings on joints, capsules to children. */
function PrimitiveLink({ body, kids }: { body: SimBody; kids: SimBody[] }) {
  const geo = useMemo(() => {
    const parts: { g: THREE.BufferGeometry; m: THREE.Material; pos: THREE.Vector3; quat: THREE.Quaternion }[] = []
    const up = new THREE.Vector3(0, 1, 0)
    const name = body.name
    if (name.endsWith('link0')) {
      parts.push({ g: new THREE.CylinderGeometry(0.09, 0.1, 0.14, 32), m: PRIM.white, pos: new THREE.Vector3(0, 0, 0.07), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2) })
    } else if (name.endsWith('hand')) {
      parts.push({ g: new THREE.BoxGeometry(0.045, 0.2, 0.055), m: PRIM.white, pos: new THREE.Vector3(0, 0, 0.03), quat: new THREE.Quaternion() })
    } else if (name.includes('finger')) {
      parts.push({ g: new THREE.BoxGeometry(0.02, 0.014, 0.05), m: PRIM.dark, pos: new THREE.Vector3(0, 0.009, 0.026), quat: new THREE.Quaternion() })
    } else if (body.joint) {
      const axis = new THREE.Vector3(...body.joint.axis).normalize()
      parts.push({ g: new THREE.CylinderGeometry(0.058, 0.058, 0.13, 32), m: name.match(/[1357]$/) ? PRIM.white : PRIM.dark, pos: new THREE.Vector3(), quat: new THREE.Quaternion().setFromUnitVectors(up, axis) })
    }
    if (!name.endsWith('hand') && !name.includes('finger')) {
      for (const c of kids) {
        const to = new THREE.Vector3(...c.pos)
        const len = to.length()
        if (len < 0.02) continue
        parts.push({
          g: new THREE.CapsuleGeometry(0.046, len, 6, 20),
          m: PRIM.white,
          pos: to.clone().multiplyScalar(0.5),
          quat: new THREE.Quaternion().setFromUnitVectors(up, to.clone().normalize()),
        })
      }
    }
    return parts
  }, [body, kids])
  useEffect(() => () => geo.forEach((p) => p.g.dispose()), [geo])
  return (
    <>
      {geo.map((p, i) => (
        <mesh key={i} geometry={p.g} material={p.m} position={p.pos} quaternion={p.quat} castShadow receiveShadow />
      ))}
    </>
  )
}

/**
 * Whether the robot's GLB meshes are actually served: true, false, or null while checking. The
 * meshes come from the sim card (`web/public/sim/`); a missing file answers with JSON, so check
 * the magic bytes.
 */
export function useGlbAvailable(url: string | undefined | null): boolean | null {
  const q = useQuery({
    queryKey: ['robot', 'glb', url],
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const res = await fetch(url!)
      if (!res.ok) return false
      const head = new Uint8Array((await res.arrayBuffer()).slice(0, 4))
      return String.fromCharCode(...head) === 'glTF'
    },
  })
  if (!url) return false
  return q.data ?? (q.isError ? false : null)
}
