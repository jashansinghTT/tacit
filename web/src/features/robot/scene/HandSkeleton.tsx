import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Vec3 } from '@/lib/api'
import { FINGERTIPS, HAND_CONNECTIONS } from '@/lib/geometry'

/**
 * The expert's hand drawn over the lit sim table: solid bones and joints in the hand's data colour
 * with a soft dark outline, so it reads on light and dark surfaces alike (additive glow washes
 * out to white on the lit table). `points` are in the parent group's frame, metres.
 */
export function HandSkeleton({ points, color, dim }: { points: MutableRefObject<Vec3[] | null>; color: string; dim: MutableRefObject<number> }) {
  const joints = useRef<THREE.InstancedMesh>(null)
  const bones = useRef<THREE.InstancedMesh>(null)
  const shadow = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(
    () => ({
      joint: new THREE.SphereGeometry(0.0065, 14, 10),
      bone: new THREE.CylinderGeometry(0.0034, 0.0034, 1, 8),
      outline: new THREE.CylinderGeometry(0.0058, 0.0058, 1, 8),
    }),
    [],
  )
  const mats = useMemo(() => {
    const c = new THREE.Color(color)
    return {
      // drawn over the arm like an overlay: the ghost often sits inside the gripper it guides
      joint: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').lerp(c, 0.45), toneMapped: false, transparent: true, depthTest: false }),
      bone: new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, depthTest: false }),
      outline: new THREE.MeshBasicMaterial({ color: '#05070a', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }),
    }
  }, [color])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), a: new THREE.Vector3(), b: new THREE.Vector3(), mid: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), [])
  useFrame(() => {
    const pts = points.current
    const j = joints.current
    const b = bones.current
    const o = shadow.current
    if (!j || !b || !o) return
    const visible = Boolean(pts && pts.length === 21)
    j.visible = b.visible = o.visible = visible
    if (!pts || !visible) return
    const k = dim.current
    mats.joint.opacity = mats.bone.opacity = 0.3 + 0.55 * k
    mats.outline.opacity = 0.2 + 0.35 * k
    for (let i = 0; i < 21; i++) {
      tmp.s.setScalar(FINGERTIPS.includes(i) || i === 0 ? 1.35 : 1)
      tmp.m.compose(tmp.a.set(pts[i][0], pts[i][1], pts[i][2]), tmp.q.identity(), tmp.s)
      j.setMatrixAt(i, tmp.m)
    }
    HAND_CONNECTIONS.forEach(([x, y], i) => {
      tmp.a.set(pts[x][0], pts[x][1], pts[x][2])
      tmp.b.set(pts[y][0], pts[y][1], pts[y][2])
      const len = tmp.a.distanceTo(tmp.b)
      tmp.mid.copy(tmp.a).add(tmp.b).multiplyScalar(0.5)
      tmp.q.setFromUnitVectors(tmp.up, tmp.b.sub(tmp.a).normalize())
      tmp.m.compose(tmp.mid, tmp.q, tmp.s.set(1, Math.max(len, 1e-4), 1))
      b.setMatrixAt(i, tmp.m)
      o.setMatrixAt(i, tmp.m)
    })
    j.instanceMatrix.needsUpdate = true
    b.instanceMatrix.needsUpdate = true
    o.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={shadow} args={[geo.outline, mats.outline, HAND_CONNECTIONS.length]} frustumCulled={false} renderOrder={10} />
      <instancedMesh ref={bones} args={[geo.bone, mats.bone, HAND_CONNECTIONS.length]} frustumCulled={false} renderOrder={11} />
      <instancedMesh ref={joints} args={[geo.joint, mats.joint, 21]} frustumCulled={false} renderOrder={12} />
    </group>
  )
}
