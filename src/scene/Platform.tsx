import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { EnvReading, Level, ZoneId } from '../telemetry/types'
import { NEUTRAL, partColor } from './colors'
import { scanHeight } from './layout'
import { anchorRef } from './labels'

const additive = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })

interface Props {
  env: EnvReading[]
  onSelect: (z: ZoneId) => void
}

/** Base ring split into four cabin-air arcs (CO · pressure · temp · humidity) and a slow scan line. */
export function Platform({ env, onSelect }: Props) {
  const spin = useRef<THREE.Group>(null)
  const scan = useRef<THREE.Group>(null)
  const scanEdge = useMemo(() => additive(NEUTRAL, 0.28), [])
  const outer = useMemo(() => additive(NEUTRAL, 0.18), [])

  const arcs = useMemo(() => {
    const gap = 0.06
    const span = (Math.PI * 2) / Math.max(env.length, 1)
    return env.map((r, i) => ({ r, start: i * span + gap / 2 + Math.PI / 4, len: span - gap }))
  }, [env])
  const arcMats = useMemo(() => new Map<string, THREE.MeshBasicMaterial>(), [])
  const matFor = (key: string, level: Level) => {
    let m = arcMats.get(key)
    if (!m) {
      m = additive(partColor(level), 0.3)
      arcMats.set(key, m)
    }
    return m
  }
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    if (spin.current) spin.current.rotation.y -= dt * 0.06
    if (scan.current) scan.current.position.y = scanHeight(t)
    const pulse = 0.5 + 0.5 * Math.sin(t * 5)
    for (const { r } of arcs) {
      const m = matFor(r.key, r.level)
      tmp.set(partColor(r.level))
      m.color.lerp(tmp, 1 - Math.exp(-5 * dt))
      m.opacity = r.level === 'danger' ? 0.5 + pulse * 0.45 : r.level === 'caution' ? 0.7 : 0.22
    }
  })

  return (
    <group>
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} material={outer}>
        <ringGeometry args={[0.92, 0.926, 128]} />
      </mesh>

      <group
        ref={spin}
        position={[0, -0.11, 0]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect('cabin')
        }}
      >
        {arcs.map(({ r, start, len }) => (
          <mesh key={r.key} rotation={[-Math.PI / 2, 0, 0]} material={matFor(r.key, r.level)} userData={{ zone: 'cabin' }}>
            <ringGeometry args={[0.7, 0.76, 64, 1, start, len]} />
          </mesh>
        ))}
      </group>

      <group position={[-0.3, 0.3, 0]} ref={anchorRef('cabin')} />

      <group ref={scan}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={scanEdge}>
          <ringGeometry args={[0.5, 0.505, 96]} />
        </mesh>
      </group>
    </group>
  )
}
