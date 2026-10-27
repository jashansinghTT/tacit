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
  const target: Vec3 = [cam[0] + dx * depth, cam[1] - 0.05, cam[2] + dz * depth]
  // pull back 0.35 m, step 0.35 m to the side, raise 0.3 m: a three-quarter of the camera's view
  return { position: [cam[0] - dx * 0.35 - dz * 0.35, cam[1] + 0.3, cam[2] - dz * 0.35 + dx * 0.35], target }
}
