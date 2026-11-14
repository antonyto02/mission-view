import { OrbitControls, Stars } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect } from 'react'
import type { Evaluation, ZoneId } from '../telemetry/types'
import { LabelProjector } from './labels'
import { MODEL_Y } from './layout'
import { ParticleBody } from './particles/ParticleBody'
import { Platform } from './Platform'

// Soft bloom is skipped on phones (cost) and can be forced off with ?nofx
const FX = !new URLSearchParams(window.location.search).has('nofx') && window.innerWidth > 860
const BASE_DISTANCE = 4.1
const BG = '#050608'

/** Pull the camera back on narrow (portrait) screens so the whole figure fits. */
function ResponsiveCamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    const aspect = size.width / size.height
    const k = Math.min(2.2, Math.max(1, 0.7 / aspect))
    const dir = camera.position.clone().normalize()
    camera.position.copy(dir.multiplyScalar(BASE_DISTANCE * k))
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height])
  return null
}

interface Props {
  evaluation: Evaluation
  bpm: number | null
  selected: ZoneId | null
  hovered: ZoneId | null
  onSelect: (z: ZoneId) => void
  onHover: (z: ZoneId | null) => void
}

export function Scene(props: Props) {
  return (
    <Canvas
      className="scene"
      camera={{ position: [0, 0.5, BASE_DISTANCE], fov: 38, near: 0.05, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      style={{ cursor: props.hovered ? 'pointer' : 'grab' }}
    >
      <color attach="background" args={[BG]} />
      <Suspense fallback={null}>
        <Stars radius={70} depth={30} count={700} factor={2} saturation={0} fade speed={0.2} />
        <group position={[0, MODEL_Y, 0]}>
          <ParticleBody {...props} />
          <Platform env={props.evaluation.env} onSelect={props.onSelect} />
        </group>
        <LabelProjector />
        <ResponsiveCamera />
        {FX && (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.3} luminanceSmoothing={0.2} />
            <Vignette offset={0.3} darkness={0.7} />
          </EffectComposer>
        )}
      </Suspense>
      <OrbitControls
        target={[0, -0.06, 0]}
        enablePan={false}
        minDistance={1.8}
        maxDistance={11}
        minPolarAngle={0.9}
        maxPolarAngle={1.95}
        enableDamping
      />
    </Canvas>
  )
}
