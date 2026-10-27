import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { forward, HOME } from './franka'

/**
 * A procedural Franka Panda built from its kinematics: white joint housings, graphite links,
 * an accent ring at every joint, and a parallel gripper. It sits in the robot's own frame
 * (z up); wrap it in a group to place it. `q` holds 7 joints plus the finger opening (metres).
 */
export function FrankaArm({
  q,
  glow = 0.6,
  ghost = false,
  color = '#e7eaee',
  accent = '#3cd7ff',
}: {
  q: MutableRefObject<number[]>
  glow?: number | MutableRefObject<number>
  ghost?: boolean
  color?: string
  accent?: string
}) {
  const housings = useRef<(THREE.Mesh | null)[]>([])
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const links = useRef<(THREE.Mesh | null)[]>([])
  const hand = useRef<THREE.Group>(null)
  const fingerL = useRef<THREE.Mesh>(null)
  const fingerR = useRef<THREE.Mesh>(null)

  const geo = useMemo(() => {
    const housing = new THREE.CylinderGeometry(0.058, 0.058, 0.13, 32).rotateX(Math.PI / 2)
    const ring = new THREE.TorusGeometry(0.06, 0.0045, 8, 48)
    const link = new THREE.CylinderGeometry(0.047, 0.047, 1, 24)
    const base = new THREE.CylinderGeometry(0.1, 0.11, 0.07, 40).rotateX(Math.PI / 2).translate(0, 0, 0.035)
    const palm = new THREE.CapsuleGeometry(0.03, 0.14, 6, 16)
    const finger = new THREE.BoxGeometry(0.018, 0.014, 0.045)
    return { housing, ring, link, base, palm, finger }
  }, [])

  const mats = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.15, transparent: ghost, opacity: ghost ? 0.25 : 1 })
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2f36', roughness: 0.55, metalness: 0.4, transparent: ghost, opacity: ghost ? 0.25 : 1 })
    const ring = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, toneMapped: false })
    return { body, dark, ring }
  }, [color, accent, ghost])

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion() }),
    [],
  )

  useFrame(() => {
    const qq = q.current?.length ? q.current : HOME
    const fk = forward(qq)
    const g = typeof glow === 'number' ? glow : glow.current
    mats.ring.opacity = 0.35 + 0.65 * g
    fk.links.forEach((L, i) => {
      const h = housings.current[i]
      if (h) h.matrix.fromArray(L)
      const r = rings.current[i]
      if (r) r.matrix.fromArray(L)
    })
    // Links connect distinct joint origins: base, 1, 3, 4, 5, 7, flange.
    const pts = [[0, 0, 0.05], ...[0, 2, 3, 4, 6].map((k) => [fk.links[k][12], fk.links[k][13], fk.links[k][14]]), [fk.flange[12], fk.flange[13], fk.flange[14]]]
    for (let i = 0; i < pts.length - 1; i++) {
      const mesh = links.current[i]
      if (!mesh) continue
      tmp.a.fromArray(pts[i])
      tmp.b.fromArray(pts[i + 1])
      const len = tmp.a.distanceTo(tmp.b)
      mesh.visible = len > 0.01
      mesh.position.copy(tmp.a).add(tmp.b).multiplyScalar(0.5)
      tmp.q.setFromUnitVectors(tmp.up, tmp.b.sub(tmp.a).normalize())
      mesh.quaternion.copy(tmp.q)
      mesh.scale.set(i === pts.length - 2 ? 0.8 : 1, Math.max(0.001, len), i === pts.length - 2 ? 0.8 : 1)
    }
    if (hand.current) {
      hand.current.matrix.fromArray(fk.flange)
      const open = Math.max(0, Math.min(0.04, qq[7] ?? 0.04))
      fingerL.current?.position.set(0, open + 0.012, 0.085)
      fingerR.current?.position.set(0, -open - 0.012, 0.085)
    }
  })

  return (
    <group>
      <mesh geometry={geo.base} material={mats.dark} />
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i}>
          <mesh ref={(el) => void (housings.current[i] = el)} geometry={geo.housing} material={i % 2 ? mats.dark : mats.body} matrixAutoUpdate={false} />
          <mesh ref={(el) => void (rings.current[i] = el)} geometry={geo.ring} material={mats.ring} matrixAutoUpdate={false} />
        </group>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} ref={(el) => void (links.current[i] = el)} geometry={geo.link} material={mats.body} />
      ))}
      <group ref={hand} matrixAutoUpdate={false}>
        <mesh geometry={geo.palm} material={mats.body} position={[0, 0, 0.032]} />
        <mesh ref={fingerL} geometry={geo.finger} material={mats.dark} />
        <mesh ref={fingerR} geometry={geo.finger} material={mats.dark} />
      </group>
    </group>
  )
}
