import { useMemo } from 'react'
import * as THREE from 'three'

/** Points from the API layout: float32 [x, y, z, r, g, b] × N (rgb in 0..1). */
export function PointCloud({ data, size = 0.006, opacity = 1, tint }: { data: Float32Array | undefined; size?: number; opacity?: number; tint?: string }) {
  const geo = useMemo(() => {
    if (!data) return null
    const n = Math.floor(data.length / 6)
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const t = tint ? new THREE.Color(tint) : null
    for (let i = 0; i < n; i++) {
      pos[i * 3] = data[i * 6]
      pos[i * 3 + 1] = data[i * 6 + 1]
      pos[i * 3 + 2] = data[i * 6 + 2]
      const r = data[i * 6 + 3]
      const g = data[i * 6 + 4]
      const b = data[i * 6 + 5]
      if (t) {
        const l = 0.3 + 0.7 * (0.3 * r + 0.59 * g + 0.11 * b)
        col.set([t.r * l, t.g * l, t.b * l], i * 3)
      } else col.set([r, g, b], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeBoundingSphere()
    return g
  }, [data, tint])
  if (!geo) return null
  return (
    <points geometry={geo}>
      <pointsMaterial size={size} vertexColors transparent opacity={opacity} sizeAttenuation depthWrite={opacity >= 1} />
    </points>
  )
}
