import { Suspense, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Vec3 } from '@/lib/api'
import type { SimScene } from '@/lib/api/robot'
import { cn } from '@/lib/cn'
import { runBuffer, useRunUi, type Pose } from './runStream'
import type { GhostTrack } from './retarget'
import { RobotModel, useGlbAvailable } from './scene/RobotModel'
import { Bin, SimObjects, SpawnRegion, Table } from './scene/SceneProps'
import { CameraFrustum, GhostHands, HumanPath, TcpTrail } from './scene/Overlays'
import { quat, toThree, Z_UP_ROTATION } from './scene/frames'

export type ViewPreset = 'overview' | 'front' | 'side' | 'top' | 'exterior'

export interface ViewerLayers {
  labels: boolean
  trail: boolean
  ghost: boolean
  cameras: boolean
  spawn: boolean
}

interface SimViewerProps {
  scene: SimScene
  pose: MutableRefObject<Pose>
  layers: ViewerLayers
  view: ViewPreset
  /** Bumped to re-apply the same preset (the "reset view" button). */
  viewNonce?: number
  ghost?: GhostTrack | null
  humanPath?: Vec3[] | null
  className?: string
  children?: ReactNode
}

/** Samples the run buffer once per frame (before anything reads the pose). */
function PoseDriver({ pose }: { pose: MutableRefObject<Pose> }) {
  useFrame(() => {
    const t = runBuffer.clock(performance.now())
    if (!runBuffer.sample(t, pose.current)) {
      pose.current.qpos = []
      pose.current.objects.clear()
      pose.current.phase = null
      pose.current.t = 0
    }
  }, -1)
  return null
}

function presetPose(view: ViewPreset, scene: SimScene): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const target = new THREE.Vector3(0.3, 0.28, 0)
  switch (view) {
    case 'front':
      return { pos: new THREE.Vector3(1.85, 0.78, 0.02), target: new THREE.Vector3(0.32, 0.26, 0) }
    case 'side':
      return { pos: new THREE.Vector3(0.36, 0.72, 1.75), target: new THREE.Vector3(0.36, 0.26, 0) }
    case 'top':
      return { pos: new THREE.Vector3(0.3, 2.15, 0.001), target: new THREE.Vector3(0.3, 0, 0) }
    case 'exterior': {
      const cam = scene.cameras?.exterior
      if (cam) {
        const pos = new THREE.Vector3(...toThree(cam.pos))
        // MuJoCo cameras look along their local -z; rotate that into the world, then to three.
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat(cam.quat))
        const d = new THREE.Vector3(...toThree([dir.x, dir.y, dir.z]))
        return { pos, target: pos.clone().add(d.multiplyScalar(0.6)) }
      }
      return { pos: new THREE.Vector3(0.3, 0.46, -0.66), target }
    }
    default:
      return { pos: new THREE.Vector3(1.62, 1.12, 1.28), target }
  }
}

/** Eases the camera to a preset; any user drag cancels the move. */
function CameraRig({ view, nonce, scene }: { view: ViewPreset; nonce: number; scene: SimScene }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const camera = useThree((s) => s.camera)
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const first = useRef(true)
  useEffect(() => {
    const g = presetPose(view, scene)
    const snap = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if ((first.current || snap) && controls) {
      first.current = false
      camera.position.copy(g.pos)
      controls.target.copy(g.target)
      controls.update()
      return
    }
    goal.current = g
  }, [view, nonce, scene, controls, camera])
  useEffect(() => {
    if (!controls) return
    const cancel = () => void (goal.current = null)
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])
  useFrame((_, dt) => {
    const g = goal.current
    if (!g || !controls) return
    const k = 1 - Math.exp(-dt * 5)
    camera.position.lerp(g.pos, k)
    controls.target.lerp(g.target, k)
    controls.update()
    if (camera.position.distanceTo(g.pos) < 0.002 && controls.target.distanceTo(g.target) < 0.002) goal.current = null
  })
  return null
}

/** A soft ring on the table under whatever the current phase is about (object to pick, bin to fill). */
function PhaseMarker({ scene, pose }: { scene: SimScene; pose: MutableRefObject<Pose> }) {
  const phase = useRunUi((s) => s.phase)
  const ref = useRef<THREE.Group>(null)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3cd7ff', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), [])
  const focus = useMemo(() => {
    if (!phase) return null
    const obj = scene.objects.find((o) => phase === `pick ${o.name}` || phase === `put down ${o.name}`)
    if (obj) return { kind: 'object' as const, name: obj.name, r: Math.max(obj.size[0], obj.size[1] ?? obj.size[0]) * 0.75 + 0.02 }
    const tgt = scene.targets.find((t) => phase === `place ${t.name}`)
    if (tgt) return { kind: 'target' as const, name: tgt.name, r: Math.max(...(tgt.outer_size ?? [0.15, 0.15]).slice(0, 2)) * 0.72 }
    return null
  }, [phase, scene])
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g || !focus) return
    if (focus.kind === 'object') {
      const p = pose.current.objects.get(focus.name)?.pos ?? scene.objects.find((o) => o.name === focus.name)?.pos
      if (p) g.position.set(p[0], p[1], 0.0025)
    } else {
      const t = scene.targets.find((x) => x.name === focus.name)
      if (t) g.position.set(t.pos[0], t.pos[1], 0.0025)
    }
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4)
    mat.opacity = 0.35 + 0.35 * k
    g.scale.setScalar(1 + 0.06 * k)
  })
  if (!focus) return null
  return (
    <group ref={ref}>
      <mesh material={mat}>
        <ringGeometry args={[focus.r, focus.r + 0.006, 64]} />
      </mesh>
    </group>
  )
}

function SceneContent({ scene, pose, layers, ghost, humanPath }: Omit<SimViewerProps, 'view' | 'viewNonce' | 'className' | 'children'>) {
  const glb = useGlbAvailable(scene.robot.bodies.find((b) => b.mesh)?.mesh)
  const progress = useRef(0)
  const table = scene.bodies.find((b) => b.name === 'table' && b.shape === 'box')
  const ext = scene.cameras?.exterior
  const wrist = scene.cameras?.wrist
  const attach = useMemo(
    () => (layers.cameras && wrist?.parent ? { [wrist.parent]: <CameraFrustum cam={wrist} depth={0.07} /> } : undefined),
    [layers.cameras, wrist],
  )
  return (
    <group rotation={Z_UP_ROTATION}>
      {table && <Table body={table} />}
      {layers.spawn && scene.spawn && <SpawnRegion spawn={scene.spawn} emphasis={1} />}
      {scene.targets.map((t) => (
        <Bin key={t.name} target={t} label={layers.labels} />
      ))}
      <SimObjects objects={scene.objects} pose={pose} labels={layers.labels} />
      <PhaseMarker scene={scene} pose={pose} />
      {glb ? (
        <Suspense fallback={<RobotModel robot={scene.robot} pose={pose} visual="primitive" attach={attach} />}>
          <RobotModel robot={scene.robot} pose={pose} visual="glb" attach={attach} />
        </Suspense>
      ) : (
        <RobotModel robot={scene.robot} pose={pose} visual="primitive" attach={attach} />
      )}
      {layers.trail && <TcpTrail pose={pose} />}
      {humanPath && humanPath.length > 1 && <HumanPath points={humanPath} progress={progress} />}
      {ghost && layers.ghost && <GhostHands track={ghost} pose={pose} progress={progress} />}
      {layers.cameras && ext && <CameraFrustum cam={ext} />}
    </group>
  )
}

/** The Robot Lab's 3D view: the MuJoCo scene drawn from its description and posed from the stream. */
export function SimViewer({ scene, pose, layers, view, viewNonce = 0, ghost, humanPath, className, children }: SimViewerProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-ink-950', className)} data-testid="sim-viewer">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        camera={{ fov: 36, near: 0.02, far: 30, position: [1.62, 1.12, 1.28] }}
        aria-label="Robot simulation view"
      >
        <color attach="background" args={['#06080a']} />
        <fog attach="fog" args={['#06080a', 3.2, 9]} />
        <PoseDriver pose={pose} />
        <ambientLight intensity={0.22} />
        <hemisphereLight args={['#cfe6ff', '#0b0d10', 0.55]} />
        <directionalLight
          position={[1.4, 2.4, 1.1]}
          intensity={2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-1}
          shadow-camera-right={1}
          shadow-camera-top={1}
          shadow-camera-bottom={-1}
          shadow-camera-near={0.5}
          shadow-camera-far={6}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />
        <pointLight position={[-0.7, 0.7, -0.9]} intensity={1.6} distance={3.5} color="#3cd7ff" />
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2.2} position={[0, 3, 0]} rotation-x={Math.PI / 2} scale={[5, 5, 1]} />
          <Lightformer form="rect" intensity={1.2} position={[3, 1, 2]} rotation-y={-Math.PI / 3} scale={[3, 1.5, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#7fdcff" position={[-3, 1, -1]} rotation-y={Math.PI / 2.5} scale={[3, 1, 1]} />
        </Environment>
        <Grid
          position={[0, -0.759, 0]}
          args={[12, 12]}
          infiniteGrid
          cellSize={0.25}
          cellThickness={0.6}
          cellColor="#151a1f"
          sectionSize={1}
          sectionThickness={1}
          sectionColor="#1d3540"
          fadeDistance={7}
          fadeStrength={1.6}
        />
        <SceneContent scene={scene} pose={pose} layers={layers} ghost={ghost} humanPath={humanPath} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.09} minDistance={0.35} maxDistance={4.5} maxPolarAngle={Math.PI * 0.49} target={[0.3, 0.28, 0]} />
        <CameraRig view={view} nonce={viewNonce} scene={scene} />
      </Canvas>
      {children}
    </div>
  )
}
