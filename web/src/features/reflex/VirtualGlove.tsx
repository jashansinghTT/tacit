import { useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, RoundedBox } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import type { FingerTrack } from '@/lib/api/learn'
import { curlsAt, FINGER_COLORS } from './fingers'

/**
 * A stylised Reflex glove: palm shell, five fingers of three segments each, an actuator at every
 * joint. Each finger bends by its curl (0 open .. 1 closed) read from the expert's finger track
 * at the lesson clock's time, so the glove moves in step with the video.
 */

// Right hand seen from the back, fingers up (+y), thumb on the left (-x), palm facing -z.
const FINGERS = [
  { base: [-0.04, -0.016, 0.002], lens: [0.034, 0.029, 0.025], r: 0.0105, splay: 0.62, thumb: true },
  { base: [-0.027, 0.05, 0], lens: [0.042, 0.026, 0.021], r: 0.0091, splay: 0.07, thumb: false },
  { base: [-0.0085, 0.054, 0], lens: [0.046, 0.029, 0.022], r: 0.0095, splay: 0, thumb: false },
  { base: [0.01, 0.051, 0], lens: [0.043, 0.027, 0.021], r: 0.009, splay: -0.07, thumb: false },
  { base: [0.0275, 0.043, 0], lens: [0.034, 0.021, 0.019], r: 0.008, splay: -0.17, thumb: false },
] as const

// Flexion in radians at curl = 1, per joint (knuckle, middle, tip).
const FLEX = [1.3, 1.7, 1.15]
const THUMB_FLEX = [0.55, 0.75, 0.95]

function Finger({ index, curls }: { index: number; curls: MutableRefObject<number[]> }) {
  const f = FINGERS[index]
  const joints = [useRef<THREE.Group>(null), useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const color = FINGER_COLORS[index]
  const mats = useMemo(
    () => ({
      seg: new THREE.MeshStandardMaterial({ color: '#2a3038', metalness: 0.45, roughness: 0.42 }),
      shell: new THREE.MeshStandardMaterial({ color: '#171b20', metalness: 0.7, roughness: 0.3 }),
      led: new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: new THREE.Color(color), emissiveIntensity: 0.4, toneMapped: false }),
    }),
    [color],
  )
  const geo = useMemo(
    () => ({
      segs: f.lens.map((l, j) => new THREE.CapsuleGeometry(f.r * (1 - j * 0.08), Math.max(0.001, l - 2 * f.r), 4, 14)),
      plates: f.lens.map((l) => new THREE.BoxGeometry(f.r * 1.5, l * 0.62, f.r * 0.5)),
      joint: new THREE.CylinderGeometry(f.r * 0.82, f.r * 0.82, f.r * 2.3, 20),
    }),
    [f],
  )
  useFrame(() => {
    const c = curls.current[index] ?? 0
    const flex = f.thumb ? THUMB_FLEX : FLEX
    joints.forEach((j, k) => {
      if (!j.current) return
      j.current.rotation.x = -c * flex[k]
      if (f.thumb) j.current.rotation.z = -c * 0.55 * (k === 0 ? 1.2 : 0.6)
    })
    mats.led.emissiveIntensity = 0.25 + 2.4 * c
  })
  const segment = (k: number, child?: React.ReactNode) => (
    <group ref={joints[k]}>
      <mesh geometry={geo.joint} material={mats.led} rotation={[0, 0, Math.PI / 2]} />
      <mesh geometry={geo.segs[k]} material={mats.seg} position={[0, f.lens[k] / 2, 0]} />
      {/* the glove's back plate on each segment */}
      <mesh geometry={geo.plates[k]} material={mats.shell} position={[0, f.lens[k] / 2, f.r * 0.85]} />
      <group position={[0, f.lens[k], 0]}>{child}</group>
    </group>
  )
  return (
    <group position={f.base as unknown as THREE.Vector3Tuple} rotation={[f.thumb ? -0.35 : 0, f.thumb ? -0.5 : 0, f.splay]}>
      {segment(0, segment(1, segment(2)))}
    </group>
  )
}

function Hand({ track, timeRef, side }: { track: FingerTrack | undefined; timeRef: MutableRefObject<number>; side: 'left' | 'right' }) {
  const group = useRef<THREE.Group>(null)
  const target = useRef([0, 0, 0, 0, 0])
  const curls = useRef([0.15, 0.15, 0.15, 0.15, 0.15])
  const reduce = useReducedMotion()
  const mats = useMemo(
    () => ({
      palm: new THREE.MeshStandardMaterial({ color: '#2a3038', metalness: 0.45, roughness: 0.42 }),
      shell: new THREE.MeshStandardMaterial({ color: '#15191e', metalness: 0.75, roughness: 0.28 }),
      strip: new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: new THREE.Color('#3cd7ff'), emissiveIntensity: 1.6, toneMapped: false }),
    }),
    [],
  )
  useFrame(({ clock }, dt) => {
    curlsAt(track, timeRef.current, target.current)
    const k = 1 - Math.exp(-dt * 18)
    for (let i = 0; i < 5; i++) curls.current[i] += (target.current[i] - curls.current[i]) * k
    if (group.current && !reduce) {
      group.current.rotation.y = -0.5 + Math.sin(clock.elapsedTime * 0.4) * 0.08
      group.current.rotation.x = 0.18 + Math.sin(clock.elapsedTime * 0.3) * 0.03
    }
  })
  return (
    <group scale={[side === 'left' ? -1 : 1, 1, 1]}>
      <group ref={group} rotation={[0.18, -0.5, 0]}>
        <RoundedBox args={[0.08, 0.088, 0.026]} radius={0.009} smoothness={4} position={[0, 0.006, 0]} material={mats.palm} />
        {/* back shell and the status strip that marks it as a Reflex glove */}
        <RoundedBox args={[0.066, 0.07, 0.008]} radius={0.003} smoothness={3} position={[0, 0.01, 0.016]} material={mats.shell} />
        <mesh position={[0, 0.032, 0.0205]} material={mats.strip}>
          <boxGeometry args={[0.04, 0.0025, 0.001]} />
        </mesh>
        <mesh position={[0, -0.052, 0]} rotation={[0, 0, 0]} material={mats.shell}>
          <cylinderGeometry args={[0.03, 0.026, 0.03, 28]} />
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
      <Canvas camera={{ position: [0.05, 0.05, 0.27], fov: 34, near: 0.01, far: 5 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#090a0c']} />
        <ambientLight intensity={0.45} />
        <directionalLight position={[0.4, 0.6, 0.7]} intensity={1.6} />
        <directionalLight position={[-0.5, 0.2, -0.4]} intensity={0.7} color="#3cd7ff" />
        <pointLight position={[0, -0.05, 0.2]} intensity={0.25} color="#a78bfa" />
        <group position={[0, -0.035, 0]}>
          <Hand track={track} timeRef={timeRef} side={side} />
        </group>
        <gridHelper args={[0.6, 30, '#1c2a30', '#11181c']} position={[0, -0.1, 0]} />
        <OrbitControls target={[0, 0.0, 0]} enablePan={false} minDistance={0.15} maxDistance={0.5} enableDamping makeDefault />
      </Canvas>
    </div>
  )
}
