// MuJoCo (metres, z up, quaternions [w, x, y, z]) to three.js (y up, quaternions x, y, z, w).
// Sim content lives under one root group rotated -90° about x, so inside it we use MuJoCo
// coordinates directly; only things placed outside that group need `toThree`.
import * as THREE from 'three'
import type { Vec3 } from '@/lib/api'
import type { Quat } from '@/lib/api/robot'

export const Z_UP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0]

export function quat(q: Quat | undefined | null): THREE.Quaternion {
  if (!q) return new THREE.Quaternion()
  return new THREE.Quaternion(q[1], q[2], q[3], q[0])
}

/** A MuJoCo-frame point in three.js world coordinates: (x, y, z) -> (x, z, -y). */
export function toThree(p: Vec3): [number, number, number] {
  return [p[0], p[2], -p[1]]
}

export function rgbaColor(rgba: number[] | undefined, fallback = '#8a9099'): THREE.Color {
  if (!rgba || rgba.length < 3) return new THREE.Color(fallback)
  return new THREE.Color().setRGB(rgba[0], rgba[1], rgba[2], THREE.SRGBColorSpace)
}
