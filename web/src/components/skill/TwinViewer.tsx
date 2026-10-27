import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Twin, TwinFrame, Vec3 } from '@/lib/api'
import { nearestFrame, POSE_CONNECTIONS } from '@/lib/geometry'
import { GhostHand } from '@/three/GhostHand'
import { twinView, type View } from './twinView'
import { PointCloud } from '@/three/PointCloud'

export interface TwinLayers {
  body: boolean
  hands: boolean
  gaze: boolean
  objects: boolean
  cloud: boolean
}

export const TWIN_LAYERS: TwinLayers = { body: true, hands: true, gaze: true, objects: true, cloud: true }

function CameraRig({ view }: { view: View }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(...view.position)
    camera.lookAt(...view.target)
    // set once per skill: the user orbits from here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.position.join(','), view.target.join(',')])
  return null
}

function Body({ frame }: { frame: MutableRefObject<TwinFrame | undefined> }) {
  const lines = useRef<THREE.LineSegments>(null)
  const head = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POSE_CONNECTIONS.length * 6), 3))
    return g
  }, [])
  useFrame(() => {
    const b = frame.current?.body
    if (!lines.current || !head.current) return
    lines.current.visible = head.current.visible = Boolean(b)
    if (!b) return
    const arr = geo.attributes.position.array as Float32Array
    POSE_CONNECTIONS.forEach(([i, j], k) => {
      arr.set(b[i] ?? [0, 0, 0], k * 6)
      arr.set(b[j] ?? [0, 0, 0], k * 6 + 3)
    })
    geo.attributes.position.needsUpdate = true
    const e7 = b[7]
    const e8 = b[8]
    if (e7 && e8) head.current.position.set((e7[0] + e8[0]) / 2, (e7[1] + e8[1]) / 2, (e7[2] + e8[2]) / 2)
  })
  return (
    <group>
      <lineSegments ref={lines} geometry={geo} frustumCulled={false}>
        <lineBasicMaterial color="#c9d3dd" transparent opacity={0.55} />
      </lineSegments>
      <mesh ref={head}>
        <sphereGeometry args={[0.085, 24, 18]} />
        <meshStandardMaterial color="#9aa6b2" transparent opacity={0.22} roughness={0.4} />
      </mesh>
    </group>
  )
}

function Gaze({ frame }: { frame: MutableRefObject<TwinFrame | undefined> }) {
  const line = useRef<THREE.Line>(null)
  const dot = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }, [])
  const lineObj = useMemo(() => new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffc857', transparent: true, opacity: 0.9, toneMapped: false })), [geo])
  useFrame(({ clock }) => {
    const g = frame.current?.gaze
    const vis = Boolean(g)
    lineObj.visible = vis
    if (dot.current) dot.current.visible = vis
    if (ring.current) ring.current.visible = vis
    if (!g) return
    const arr = geo.attributes.position.array as Float32Array
    arr.set(g.origin, 0)
    arr.set(g.target, 3)
    geo.attributes.position.needsUpdate = true
    dot.current?.position.set(...g.target)
    if (ring.current) {
      ring.current.position.set(g.target[0], g.target[1] + 0.002, g.target[2])
      const s = 1 + 0.25 * Math.sin(clock.elapsedTime * 5)
      ring.current.scale.setScalar(s)
    }
  })
  return (
    <group>
      <primitive object={lineObj} ref={line} />
      <mesh ref={dot}>
        <sphereGeometry args={[0.008, 12, 10]} />
        <meshBasicMaterial color="#ffc857" toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.025, 0.031, 40]} />
        <meshBasicMaterial color="#ffc857" transparent opacity={0.8} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Objects({ frame, highlight }: { frame: MutableRefObject<TwinFrame | undefined>; highlight?: string | null }) {
  const group = useRef<THREE.Group>(null)
  const labels = useMemo(() => frame.current?.objects.map((o) => o.label) ?? [], [frame])
  useFrame(() => {
    const objs = frame.current?.objects
    if (!objs || !group.current) return
    group.current.children.forEach((c, i) => {
      const o = objs[i]
      if (!o) {
        c.visible = false
        return
      }
      c.visible = true
      c.position.set(...o.pos)
    })
  })
  return (
    <group ref={group}>
      {labels.map((l, i) => (
        <group key={`${l}-${i}`}>
          <mesh>
            <octahedronGeometry args={[0.012]} />
            <meshBasicMaterial color={l === highlight ? '#ffffff' : '#7cf5c4'} toneMapped={false} />
          </mesh>
          <Html center position={[0, 0.045, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <span className={`telemetry rounded-sm px-1.5 py-0.5 text-[10px] whitespace-nowrap ${l === highlight ? 'bg-white text-ink-950' : 'bg-ink-950/80 text-data-object'}`}>{l}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}

function TwinScene({ twin, timeRef, layers, cloud, highlight }: { twin: Twin; timeRef: MutableRefObject<number>; layers: TwinLayers; cloud?: Float32Array; highlight?: string | null }) {
  const frame = useRef<TwinFrame | undefined>(twin.frames[0])
  const left = useRef<Vec3[] | null>(null)
  const right = useRef<Vec3[] | null>(null)
  useFrame(() => {
    const f = nearestFrame(twin.frames, timeRef.current)
    frame.current = f
    left.current = f?.hands.left ?? null
    right.current = f?.hands.right ?? null
  })
  const view = useMemo(() => twinView(twin), [twin])
  return (
    <>
      <color attach="background" args={['#08090b']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[1, 2, -1]} intensity={1.2} />
      <gridHelper args={[3, 60, '#1c2a30', '#121a1e']} position={[0, -0.002, 0]} />
      {layers.cloud && <PointCloud data={cloud} size={0.007} />}
      {layers.body && <Body frame={frame} />}
      {layers.hands && (
        <>
          <GhostHand points={left} color="#3cd7ff" jointScale={1.1} />
          <GhostHand points={right} color="#a78bfa" jointScale={1.1} />
        </>
      )}
      {layers.gaze && <Gaze frame={frame} />}
      {layers.objects && <Objects frame={frame} highlight={highlight} />}
      <CameraRig view={view} />
      <OrbitControls target={view.target} enableDamping makeDefault minDistance={0.3} maxDistance={5} />
    </>
  )
}

export function TwinViewer({
  twin,
  timeRef,
  layers = TWIN_LAYERS,
  cloud,
  highlight,
  className,
}: {
  twin: Twin
  timeRef: MutableRefObject<number>
  layers?: TwinLayers
  cloud?: Float32Array
  highlight?: string | null
  className?: string
}) {
  return (
    <div className={className} data-testid="twin-viewer">
      <Canvas camera={{ position: twinView(twin).position, fov: 42, near: 0.02, far: 20 }} dpr={[1, 2]}>
        <TwinScene twin={twin} timeRef={timeRef} layers={layers} cloud={cloud} highlight={highlight} />
      </Canvas>
    </div>
  )
}

export function CloudViewer({ data, className, tint, autoRotate = true, view }: { data: Float32Array | undefined; className?: string; tint?: string; autoRotate?: boolean; view?: View }) {
  const v = view ?? twinView(undefined)
  return (
    <div className={className} data-testid="cloud-viewer">
      <Canvas camera={{ position: v.position, fov: 40, near: 0.02, far: 20 }} dpr={[1, 2]}>
        <color attach="background" args={['#08090b']} />
        <gridHelper args={[3, 60, '#1c2a30', '#121a1e']} position={[0, Math.min(-0.003, v.target[1] - 0.5), 0]} />
        <PointCloud data={data} size={0.008} tint={tint} />
        <CameraRig view={v} />
        <OrbitControls target={v.target} autoRotate={autoRotate} autoRotateSpeed={0.5} enableDamping makeDefault />
      </Canvas>
    </div>
  )
}
