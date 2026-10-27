import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls, RoundedBox } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import type { FingerTrack } from '@/lib/api/learn'
import { curlsAt, FINGER_COLORS } from './fingers'

/**
 * A stylised Reflex glove: a rounded palm with a matte graphite shell and five fingers of three
 * capsule segments, each with an exoskeleton rail along its back and an accent-lit actuator ring
 * at every joint. Each finger bends by its curl (0 open .. 1 closed), read from the expert's
 * finger track at the lesson clock's time, so the glove moves in step with the video.
 */

// Right hand seen from the back, fingers up (+y), thumb on the left (-x), palm facing -z.
const FINGERS = [
  { base: [-0.039, -0.012, 0.003], lens: [0.034, 0.029, 0.025], r: 0.0105, splay: 0.62, thumb: true },
  { base: [-0.026, 0.05, 0], lens: [0.042, 0.026, 0.021], r: 0.0092, splay: 0.07, thumb: false },
  { base: [-0.0085, 0.054, 0], lens: [0.046, 0.029, 0.022], r: 0.0096, splay: 0, thumb: false },
  { base: [0.0095, 0.051, 0], lens: [0.043, 0.027, 0.021], r: 0.009, splay: -0.07, thumb: false },
  { base: [0.0265, 0.043, 0], lens: [0.034, 0.021, 0.019], r: 0.0081, splay: -0.17, thumb: false },
] as const

// Flexion in radians at curl = 1, per joint (knuckle, middle, tip).
const FLEX = [1.3, 1.7, 1.15]
const THUMB_FLEX = [0.55, 0.75, 0.95]

// Glove fabric, the matte graphite exoskeleton, and dark joint caps.
const FABRIC = new THREE.MeshStandardMaterial({ color: '#6b7482', metalness: 0.05, roughness: 0.82 })
const SHELL = new THREE.MeshStandardMaterial({ color: '#3a414b', metalness: 0.25, roughness: 0.6 })
const CAP = new THREE.MeshStandardMaterial({ color: '#1d2228', metalness: 0.3, roughness: 0.55 })

const START = new THREE.Vector3(0.16, 0.2, 0.62)
const TARGET = new THREE.Vector3(0.004, 0.05, 0)
// The camera looks along this direction; its distance follows the grip (open hand far, fist near).
const VIEW_DIR = new THREE.Vector3(0.02, 0.04, 0.47).normalize()
const FAR = 0.47
const NEAR = 0.35

/**
 * Eases the camera in from a wide shot, then keeps the hand framed: closer for a fist, further
 * for an open hand. Once the trainee orbits the view, it stays where they put it.
 */
function CameraRig({ curls }: { curls: MutableRefObject<number[]> }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3; update: () => void }) | null
  const reduce = useReducedMotion()
  const intro = useRef(reduce ? 1 : 0)
  const touched = useRef(false)
  const tmp = useMemo(() => ({ target: new THREE.Vector3(), want: new THREE.Vector3() }), [])
  useEffect(() => {
    if (!controls) return
    const onStart = () => void (touched.current = true)
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [controls])
  useFrame((_, dt) => {
    if (touched.current) return
    const c = curls.current.reduce((a, b) => a + b, 0) / 5
    tmp.target.set(TARGET.x, TARGET.y - 0.018 * c, TARGET.z)
    tmp.want.copy(VIEW_DIR).multiplyScalar(FAR - (FAR - NEAR) * c).add(tmp.target)
    if (intro.current < 1) {
      intro.current = Math.min(1, intro.current + dt / 1.6)
      camera.position.lerpVectors(START, tmp.want, 1 - Math.pow(1 - intro.current, 3))
    } else {
      camera.position.lerp(tmp.want, 1 - Math.exp(-dt * (reduce ? 50 : 2)))
    }
    if (controls) {
      controls.target.lerp(tmp.target, 0.2)
      controls.update()
    } else camera.lookAt(tmp.target)
  })
  return null
}

function Finger({ index, curls }: { index: number; curls: MutableRefObject<number[]> }) {
  const f = FINGERS[index]
  const j0 = useRef<THREE.Group>(null)
  const j1 = useRef<THREE.Group>(null)
  const j2 = useRef<THREE.Group>(null)
  const led = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: new THREE.Color(FINGER_COLORS[index]), emissiveIntensity: 0.4, roughness: 0.4, toneMapped: false }),
    [index],
  )
  const geo = useMemo(
    () => ({
      segs: f.lens.map((l, j) => new THREE.CapsuleGeometry(f.r * (1 - j * 0.08), Math.max(0.001, l - 2 * f.r), 6, 18)),
      rails: f.lens.map((l, j) => new THREE.CapsuleGeometry(f.r * 0.42 * (1 - j * 0.08), Math.max(0.001, l * 0.5), 4, 12)),
      ring: new THREE.TorusGeometry(f.r * 1.04, f.r * 0.17, 10, 32),
      cap: new THREE.SphereGeometry(f.r * 0.62, 16, 12),
      tip: new THREE.SphereGeometry(f.r * 0.5, 14, 10),
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
    led.emissiveIntensity = 0.3 + 1.6 * c
  })
  const segment = (k: number, ref: React.RefObject<THREE.Group>, child?: ReactNode) => (
    <group ref={ref}>
      {/* the actuator at the joint: a lit ring around a dark cap */}
      <mesh geometry={geo.ring} material={led} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.cap} material={CAP} position={[0, 0, f.r * 0.75]} />
      <mesh geometry={geo.segs[k]} material={FABRIC} position={[0, f.lens[k] / 2, 0]} />
      {/* the exoskeleton rail along the back of the segment */}
      <mesh geometry={geo.rails[k]} material={SHELL} position={[0, f.lens[k] / 2, f.r * 0.92]} />
      <group position={[0, f.lens[k], 0]}>{child ?? <mesh geometry={geo.tip} material={led} position={[0, -f.r * 0.25, f.r * 0.6]} />}</group>
    </group>
  )
  return (
    <group position={f.base as unknown as THREE.Vector3Tuple} rotation={[f.thumb ? -0.35 : 0, f.thumb ? -0.5 : 0, f.splay]}>
      {segment(0, j0, segment(1, j1, segment(2, j2)))}
    </group>
  )
}

function Hand({ track, timeRef, side, curls }: { track: FingerTrack | undefined; timeRef: MutableRefObject<number>; side: 'left' | 'right'; curls: MutableRefObject<number[]> }) {
  const group = useRef<THREE.Group>(null)
  const target = useRef([0, 0, 0, 0, 0])
  const reduce = useReducedMotion()
  const strip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b0d10', emissive: new THREE.Color('#3cd7ff'), emissiveIntensity: 1.3, toneMapped: false }), [])
  useFrame(({ clock }, dt) => {
    curlsAt(track, timeRef.current, target.current)
    const k = 1 - Math.exp(-dt * 18)
    for (let i = 0; i < 5; i++) curls.current[i] += (target.current[i] - curls.current[i]) * k
    if (group.current && !reduce) {
      group.current.rotation.y = -0.85 + Math.sin(clock.elapsedTime * 0.4) * 0.12
      group.current.rotation.x = 0.2 + Math.sin(clock.elapsedTime * 0.3) * 0.03
    }
  })
  return (
    <group scale={[side === 'left' ? -1 : 1, 1, 1]}>
      <group ref={group} rotation={[0.2, -0.85, 0]}>
        <RoundedBox args={[0.08, 0.09, 0.028]} radius={0.013} smoothness={6} position={[0, 0.006, 0]} material={FABRIC} />
        {/* the back shell and status strip that make it a Reflex glove */}
        <RoundedBox args={[0.056, 0.058, 0.012]} radius={0.0058} smoothness={6} position={[0, 0.012, 0.0152]} material={SHELL} />
        <mesh position={[0, 0.03, 0.0215]} rotation={[0, 0, Math.PI / 2]} material={strip}>
          <capsuleGeometry args={[0.0012, 0.028, 4, 8]} />
        </mesh>
        <mesh position={[0, -0.05, 0]} material={SHELL}>
          <cylinderGeometry args={[0.031, 0.028, 0.03, 40]} />
        </mesh>
        {FINGERS.map((_, i) => (
          <Finger key={i} index={i} curls={curls} />
        ))}
      </group>
    </group>
  )
}

export function VirtualGlove({ track, timeRef, side = 'right', className }: { track: FingerTrack | undefined; timeRef: MutableRefObject<number>; side?: 'left' | 'right'; className?: string }) {
  const curls = useRef([0.15, 0.15, 0.15, 0.15, 0.15])
  return (
    <div className={className} data-testid="virtual-glove">
      <Canvas camera={{ position: START.toArray(), fov: 34, near: 0.01, far: 5 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={['#090a0c']} />
        <hemisphereLight args={['#e6eef8', '#0b0d10', 0.75]} />
        <directionalLight position={[0.4, 0.7, 0.7]} intensity={2.0} />
        <directionalLight position={[0.1, 0.15, 0.9]} intensity={0.55} />
        <directionalLight position={[-0.6, 0.3, -0.5]} intensity={1.0} color="#3cd7ff" />
        <Hand track={track} timeRef={timeRef} side={side} curls={curls} />
        <ContactShadows position={[0, -0.072, 0]} opacity={0.55} scale={0.45} blur={2.6} far={0.25} resolution={512} color="#000000" />
        <OrbitControls target={TARGET.toArray()} enablePan={false} minDistance={0.2} maxDistance={0.8} enableDamping makeDefault />
        <CameraRig curls={curls} />
      </Canvas>
    </div>
  )
}
