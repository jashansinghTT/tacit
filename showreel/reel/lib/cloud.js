// VGGT point clouds (the backend's format: float32 x, y, z, r, g, b per point; y up, z toward the
// viewer) drawn by a small CPU rasteriser with a z-buffer straight into device pixels.
import { R } from '../main.js'
import { rot } from './hand.js'

export async function loadCloud(path) {
  const f = new Float32Array(await R.bin(path))
  const n = f.length / 6
  const pos = new Float32Array(n * 3)
  const col = new Uint8ClampedArray(n * 3)
  const c = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = f[i * 6 + k]
      col[i * 3 + k] = f[i * 6 + 3 + k] * 255
    }
  }
  // Centre on the median (robust to stray points).
  for (let k = 0; k < 3; k++) {
    const v = Array.from({ length: n }, (_, i) => pos[i * 3 + k]).sort((a, b) => a - b)
    c[k] = v[n >> 1]
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] -= c[k]
  return { n, pos, col }
}

/** A full-stage raster target (device pixels) with a z-buffer. */
export function raster(parent) {
  const W = R.W * R.DPR
  const H = R.H * R.DPR
  const c = R.el('canvas', 'fx', parent)
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const img = g.createImageData(W, H)
  const px = img.data
  const zb = new Float32Array(W * H)
  return {
    c, g, W, H, px,
    clear() { px.fill(0); zb.fill(Infinity) },
    /** Splat a square of side s device px at device (x, y), depth z, colour rgb, alpha a. */
    splat(x, y, z, r, gg, b, s = 2, a = 1) {
      const x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2)
      for (let yy = y0; yy < y0 + s; yy++) {
        if (yy < 0 || yy >= H) continue
        for (let xx = x0; xx < x0 + s; xx++) {
          if (xx < 0 || xx >= W) continue
          const i = yy * W + xx
          if (z >= zb[i]) continue
          zb[i] = z
          const o = i * 4
          px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255 * a
        }
      }
    },
    /** Write one channel only (for chromatic separation), keeping the brighter value. */
    splatCh(x, y, ch, v, s = 2) {
      const x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2)
      for (let yy = y0; yy < y0 + s; yy++) {
        if (yy < 0 || yy >= H) continue
        for (let xx = x0; xx < x0 + s; xx++) {
          if (xx < 0 || xx >= W) continue
          const o = (yy * W + xx) * 4
          if (v > px[o + ch]) px[o + ch] = v
          px[o + 3] = 255
        }
      }
    },
    flush() { g.putImageData(img, 0, 0) },
  }
}

/**
 * Projection for a view {yaw, pitch, dist, f, cx, cy, scale}: cloud metres (y up, +z toward the
 * camera) to stage px. Returns [x, y, depth] or null behind the camera.
 */
export function projector({ yaw = 0, pitch = 0, dist = 2, f = 1400, cx = R.W / 2, cy = R.H / 2, scale = 1 } = {}) {
  return (x, y, z) => {
    const q = rot([x * scale, -y * scale, z * scale], yaw, pitch)
    const d = dist - q[2]
    if (d <= 0.05) return null
    return [cx + (q[0] * f) / d, cy + (q[1] * f) / d, d]
  }
}
