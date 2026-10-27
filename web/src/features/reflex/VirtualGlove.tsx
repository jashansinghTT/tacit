import { useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, RoundedBox } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import type { FingerTrack } from '@/lib/api/learn'
import { curlsAt, FINGER_COLORS } from './fingers'

/**
 * A stylised Reflex glove: a palm shell and five fingers of three segments each, with an
 * exoskeleton plate on every segment and a glowing actuator ring at every joint. Each finger
 * bends by its curl (0 open .. 1 closed), read from the expert's finger track at the lesson
 * clock's time, so the glove moves in step with the video.
 */

// Right hand seen from the back, fingers up (+y), thumb on the left (-x), palm facing -z.
const FINGERS = [
  { base: [-0.039, -0.014, 0.003], lens: [0.034, 0.029, 0.025], r: 0.0102, splay: 0.62, thumb: true },
  { base: [-0.026, 0.05, 0], lens: [0.042, 0.026, 0.021], r: 0.0089, splay: 0.07, thumb: false },
  { base: [-0.0085, 0.054, 0], lens: [0.046, 0.029, 0.022], r: 0.0093, splay: 0, thumb: false },
  { base: [0.0095, 0.051, 0], lens: [0.043, 0.027, 0.021], r: 0.0088, splay: -0.07, thumb: false },
  { base: [0.0265, 0.043, 0], lens: [0.034, 0.021, 0.019], r: 0.0078, splay: -0.17, thumb: false },
] as const

// Flexion in radians at curl = 1, per joint (knuckle, middle, tip).
const FLEX = [1.3, 1.7, 1.15]
const THUMB_FLEX = [0.55, 0.75, 0.95]

const SKIN = new THREE.MeshStandardMaterial({ color: '#59626e', metalness: 0.25, roughness: 0.55 })
const SHELL = new THREE.MeshStandardMaterial({ color: '#262c35', metalness: 0.85, roughness: 0.3 })

function Finger({ index, curls }: { index: number; curls: MutableRefObject<number[]> }) {
  const f = FINGERS[index]
  const j0 = useRef<THREE.Group>(null)
  const j1 = useRef<THREE.Group>(null)
  const j2 = useRef<THREE.Group>(null)
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: new THREE.Color(FINGER_COLORS[index]), emissiveIntensity: 0.4, toneMapped: false }), [index])
  const geo = useMemo(
    () => ({
      segs: f.lens.map((l, j) => new THREE.CapsuleGeometry(f.r * (1 - j * 0.08), Math.max(0.001, l - 2 * f.r), 4, 16)),
      plates: f.lens.map((l, j) => new THREE.BoxGeometry(f.r * 1.7 * (1 - j * 0.08), l * 0.58, f.r * 0.55)),
      ring: new THREE.TorusGeometry(f.r * 1.02, f.r * 0.16, 8, 28),
    }),
    [f],
  )
  useFrame(() => {
    const c = curls.current[index] ?? 0
    const flex = f.thumb ? THUMB_FLEX : FLEX
    ;[j0, j1, j2].forEach((j, k) => {
      if (!j.current) return
      j.current.rotation.x = -c * flex[k]
      if (f.thumb) j.current.rotation.z = -c * 0.55 * (k === 0 ? 1.2 : 0.6)
    })
    led.emissiveIntensity = 0.35 + 1.5 * c
  })
  const segment = (k: number, ref: React.RefObject<THREE.Group>, child?: ReactNode) => (
    <group ref={ref}>
      {/* actuator ring around the joint */}
      <mesh geometry={geo.ring} material={led} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.segs[k]} material={SKIN} position={[0, f.lens[k] / 2, 0]} />
      <mesh geometry={geo.plates[k]} material={SHELL} position={[0, f.lens[k] / 2, f.r * 0.9]} />
      <group position={[0, f.lens[k], 0]}>{child}</group>
    </group>
  )
  return (
    <group position={f.base as unknown as THREE.Vector3Tuple} rotation={[f.thumb ? -0.35 : 0, f.thumb ? -0.5 : 0, f.splay]}>
      {segment(0, j0, segment(1, j1, segment(2, j2)))}
    </group>
  )
}

function Hand({ track, timeRef, side }: { track: FingerTrack | undefined; timeRef: MutableRefObject<number>; side: 'left' | 'right' }) {
  const group = useRef<THREE.Group>(null)
  const target = useRef([0, 0, 0, 0, 0])
  const curls = useRef([0.15, 0.15, 0.15, 0.15, 0.15])
  const reduce = useReducedMotion()
  const strip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: new THREE.Color('#3cd7ff'), emissiveIntensity: 1.4, toneMapped: false }), [])
  useFrame(({ clock }, dt) => {
    curlsAt(track, timeRef.current, target.current)
    const k = 1 - Math.exp(-dt * 18)
    for (let i = 0; i < 5; i++) curls.current[i] += (target.current[i] - curls.current[i]) * k
    if (group.current && !reduce) {
      group.current.rotation.y = -1.0 + Math.sin(clock.elapsedTime * 0.4) * 0.12
      group.current.rotation.x = 0.22 + Math.sin(clock.elapsedTime * 0.3) * 0.03
    }
  })
  return (
    <group scale={[side === 'left' ? -1 : 1, 1, 1]}>
      <group ref={group} rotation={[0.22, -1.0, 0]}>
        <RoundedBox args={[0.08, 0.088, 0.026]} radius={0.01} smoothness={4} position={[0, 0.006, 0]} material={SKIN} />
        {/* the back shell and status strip that make it a Reflex glove */}
        <RoundedBox args={[0.07, 0.074, 0.009]} radius={0.004} smoothness={3} position={[0, 0.01, 0.016]} material={SHELL} />
        <mesh position={[0, 0.036, 0.0212]} material={strip}>
          <boxGeometry args={[0.042, 0.0022, 0.001]} />
        </mesh>
        <mesh position={[0, -0.05, 0]} material={SHELL}>
          <cylinderGeometry args={[0.031, 0.027, 0.028, 32]} />
        </mesh>
        {FINGERS.map((_, i) => (
          <Finger key={i} index={i} curls={curls} />
        ))}
      </group>
    </group>
  )
}

export function VirtualGlove({ track, timeRef, side = 'right', className }: { track: FingerTrack | undefined; timeRef: MutableRefObject<number>; side?: 'left' | 'right'; className?: string }) {
  return (
    <div className={className} data-testid="virtual-glove">
      <Canvas camera={{ position: [0.0, 0.08, 0.31], fov: 34, near: 0.01, far: 5 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#090a0c']} />
        <hemisphereLight args={['#dfe9f5', '#0b0d10', 0.55]} />
        <directionalLight position={[0.4, 0.6, 0.7]} intensity={1.7} />
        <directionalLight position={[-0.6, 0.25, -0.5]} intensity={1.1} color="#3cd7ff" />
        <pointLight position={[0.1, -0.08, 0.25]} intensity={0.12} color="#a78bfa" />
        <group position={[0, 0.0, 0]}>
          <Hand track={track} timeRef={timeRef} side={side} />
        </group>
        <gridHelper args={[0.8, 32, '#1c2a30', '#10171a']} position={[0, -0.07, 0]} />
        <OrbitControls target={[0.008, 0.035, 0]} enablePan={false} minDistance={0.18} maxDistance={0.6} enableDamping makeDefault />
      </Canvas>
    </div>
  )
}
