import type { Twin, Vec3 } from '@/lib/api'

export interface View {
  position: Vec3
  target: Vec3
}

/**
 * Start from the recording camera (pulled back and raised a little) so the first frame reads like
 * the video; VGGT clouds are surfaces seen from that camera. Falls back to a front three-quarter.
 */
export function twinView(twin: Pick<Twin, 'bounds' | 'camera'> | undefined): View {
  const b = twin?.bounds
  const center: Vec3 = b ? [(b.min[0] + b.max[0]) / 2, Math.max(b.min[1], Math.min(b.max[1], 0.15)), (b.min[2] + b.max[2]) / 2] : [0, 0.15, 0]
  const cam = twin?.camera?.position
  if (!cam) return { position: [center[0] + 0.55, center[1] + 0.7, center[2] - 1.4], target: center }
  let dx = center[0] - cam[0]
  let dz = center[2] - cam[2]
  const len = Math.hypot(dx, dz) || 1
  dx /= len
  dz /= len
  const depth = twin?.camera?.person_depth_m ?? 1.4
  // aim at the work area in front of the person, not at the camera's own height
  const target: Vec3 = [cam[0] + dx * depth, center[1], cam[2] + dz * depth]
  // pull back 0.5 m, step 0.4 m to the side, raise 0.35 m: a three-quarter of the camera's view
  return { position: [cam[0] - dx * 0.5 - dz * 0.4, cam[1] + 0.35, cam[2] - dz * 0.5 + dx * 0.4], target }
}

/**
 * A view for a bare point cloud (no twin): VGGT clouds are in a camera frame looking down -z, so
 * stand in front of the cloud on the +z side, a little to the side and above.
 */
export function cloudView(points: Float32Array | undefined): View {
  if (!points || points.length < 6) return { position: [0.4, 0.35, 0.9], target: [0, 0, -0.3] }
  const n = points.length / 6
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  const step = Math.max(1, Math.floor(n / 4000))
  for (let i = 0; i < n; i += step) {
    for (let k = 0; k < 3; k++) {
      const v = points[i * 6 + k]
      if (v < lo[k]) lo[k] = v
      if (v > hi[k]) hi[k] = v
    }
  }
  const c: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], 0.2)
  return { position: [c[0] + ext * 0.45, c[1] + ext * 0.3, hi[2] + ext * 1.25], target: c }
}
