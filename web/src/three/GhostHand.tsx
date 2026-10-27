import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vec3 } from '@/lib/api'
import { FINGERTIPS, HAND_CONNECTIONS } from '@/lib/geometry'

/**
 * A glowing skeleton hand: 21 joints and 21 bones, updated imperatively every frame from
 * `points` (three.js world coordinates, metres). Additive blending gives the "ghost" look.
 */
export function GhostHand({
  points,
  color = '#3cd7ff',
  intensity,
  jointScale = 1,
}: {
  points: MutableRefObject<Vec3[] | null>
  color?: string
  intensity?: MutableRefObject<number>
  jointScale?: number
}) {
  const joints = useRef<THREE.InstancedMesh>(null)
  const halos = useRef<THREE.InstancedMesh>(null)
  const bones = useRef<THREE.InstancedMesh>(null)

  const geo = useMemo(
    () => ({
      joint: new THREE.SphereGeometry(0.0055 * jointScale, 12, 10),
      halo: new THREE.SphereGeometry(0.011 * jointScale, 12, 10),
      bone: new THREE.CylinderGeometry(0.0026 * jointScale, 0.0026 * jointScale, 1, 6),
    }),
    [jointScale],
  )
  const mats = useMemo(() => {
    const c = new THREE.Color(color)
    return {
      joint: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(c, 0.35), toneMapped: false }),
      halo: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      bone: new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    }
  }, [color])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), [])

  useFrame(() => {
    const pts = points.current
    const j = joints.current
    const h = halos.current
    const b = bones.current
    if (!j || !h || !b) return
    const visible = Boolean(pts && pts.length === 21)
    j.visible = h.visible = b.visible = visible
    if (!pts || !visible) return
    const k = intensity?.current ?? 1
    mats.halo.opacity = 0.05 + 0.14 * k
    mats.bone.opacity = 0.45 + 0.5 * k
    for (let i = 0; i < 21; i++) {
      const tip = FINGERTIPS.includes(i) || i === 0
      tmp.s.setScalar(tip ? 1.35 : 1)
      tmp.m.compose(tmp.a.set(...pts[i]), tmp.q.identity(), tmp.s)
      j.setMatrixAt(i, tmp.m)
      tmp.s.setScalar((tip ? 1.25 : 0.8) * (0.8 + 0.4 * k))
      tmp.m.compose(tmp.a, tmp.q, tmp.s)
      h.setMatrixAt(i, tmp.m)
    }
    HAND_CONNECTIONS.forEach(([x, y], i) => {
      tmp.a.set(...pts[x])
      tmp.b.set(...pts[y])
      const len = tmp.a.distanceTo(tmp.b)
      const mid = tmp.a.clone().add(tmp.b).multiplyScalar(0.5)
      tmp.q.setFromUnitVectors(tmp.up, tmp.b.sub(tmp.a).normalize())
      tmp.m.compose(mid, tmp.q, tmp.s.set(1, Math.max(len, 1e-4), 1))
      b.setMatrixAt(i, tmp.m)
    })
    j.instanceMatrix.needsUpdate = true
    h.instanceMatrix.needsUpdate = true
    b.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={bones} args={[geo.bone, mats.bone, HAND_CONNECTIONS.length]} frustumCulled={false} />
      <instancedMesh ref={halos} args={[geo.halo, mats.halo, 21]} frustumCulled={false} />
      <instancedMesh ref={joints} args={[geo.joint, mats.joint, 21]} frustumCulled={false} />
    </group>
  )
}
