import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Evaluation, Level, ZoneId } from '../../telemetry/types'
import { partColor } from '../colors'
import { MODEL_Y, scanHeight } from '../layout'
import { anchorRef } from '../labels'
import { POSE_STALE_MS, poseStore } from '../../pose/poseStore'
import { BONE_COUNT, PoseSolver } from '../../pose/skeleton'
import { HEART_CENTER, LUNG_CENTER_Y, LUNG_X } from './bodySdf'
import { sampleBody } from './sample'

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uBeatAge;
  uniform float uBreath;
  uniform float uOffline;
  uniform float uScanY;
  uniform float uPixel;
  uniform float uHover;
  uniform vec3 uHeart;
  uniform vec3 uZoneColor[4];
  uniform float uZoneAlarm[4];
  uniform mat4 uBones[${BONE_COUNT}];
  attribute float aZone;
  attribute float aKind;
  attribute float aSeed;
  attribute vec2 aBones;
  attribute float aWeight;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    int zi = int(aZone + 0.5);
    vec3 p = position;

    // lungs breathe around their own centers
    if (zi == 2) {
      vec3 c = vec3(sign(p.x) * ${LUNG_X.toFixed(3)}, ${LUNG_CENTER_Y.toFixed(3)}, -0.006);
      p = c + (p - c) * (1.0 + uBreath * 0.07);
    }

    // skeleton: blend the two bones this particle belongs to
    vec3 s0 = (uBones[int(aBones.x + 0.5)] * vec4(p, 1.0)).xyz;
    vec3 s1 = (uBones[int(aBones.y + 0.5)] * vec4(p, 1.0)).xyz;
    p = mix(s1, s0, aWeight);

    float alarm = uZoneAlarm[zi];
    float t = uTime;
    float s = aSeed * 97.0;

    // slow drift for everyone, fast agitation where something is wrong
    p += vec3(sin(t * 0.7 + s), sin(t * 0.9 + s * 1.3), cos(t * 0.6 + s * 0.7)) * 0.0018;
    float agit = alarm >= 1.5 ? 0.009 : alarm >= 0.9 ? 0.004 : 0.0;
    p += vec3(sin(t * 23.0 + s), cos(t * 19.0 + s * 1.7), sin(t * 29.0 + s * 0.3)) * agit;

    // no signal: the body comes apart and sinks
    vec3 outward = normalize(vec3(p.x, 0.0, p.z) + vec3(0.0001, 0.0, 0.0));
    float fray = aSeed * aSeed;
    p += (outward * 0.09 + vec3(0.0, -0.035, 0.0)) * uOffline * fray;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;

    // heartbeat wave travelling out from the heart
    float d = distance(position, uHeart);
    float r = uBeatAge * 1.35;
    float ripple = exp(-pow((d - r) / 0.05, 2.0)) * exp(-uBeatAge * 1.4);
    float scan = exp(-pow((world.y - uScanY) / 0.018, 2.0));

    float organ = zi == 1 ? 0.55 : zi == 2 ? 0.42 : 0.32;
    float base = aKind < 0.5 ? 0.46 : aKind < 1.5 ? 0.1 : aKind < 2.5 ? organ : 0.3;
    float pulse = alarm >= 1.5 ? 0.6 + 0.4 * sin(t * 6.0) : 1.0;
    float hover = abs(aZone - uHover) < 0.5 ? 1.5 : 1.0;

    vColor = uZoneColor[zi];
    vAlpha = (base + ripple * 0.85 + scan * 0.5) * pulse * hover * mix(1.0, 0.65, uOffline);

    float size = aKind > 1.5 && aKind < 2.5 ? 2.3 : aKind < 1.5 && aKind > 0.5 ? 1.5 : 1.8;
    gl_PointSize = size * uPixel * (4.2 / -mv.z) * (1.0 + ripple * 0.7);
  }
`

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`

const ZONE_INDEX: Record<'head' | 'heart' | 'lungs' | 'body', number> = { head: 0, heart: 1, lungs: 2, body: 3 }
const alarmOf = (l: Level) => (l === 'danger' ? 2 : l === 'caution' ? 1 : 0)

const PRIORITY: ZoneId[] = ['heart', 'lungs', 'head', 'cabin', 'body']
function pickZone(e: ThreeEvent<PointerEvent | MouseEvent>): ZoneId | null {
  const hit = new Set<ZoneId>()
  for (const i of e.intersections) {
    const z = i.object.userData?.zone as ZoneId | undefined
    if (z) hit.add(z)
  }
  return PRIORITY.find((z) => hit.has(z)) ?? null
}

type V3 = [number, number, number]
const ANCHORS: { zone: ZoneId; at: V3 }[] = [
  { zone: 'heart', at: [0.48, 1.28, 0] },
  { zone: 'lungs', at: [-0.48, 1.28, 0] },
  { zone: 'head', at: [-0.2, 1.72, 0] },
  { zone: 'body', at: [0.3, 0.5, 0] },
]

/** Invisible shapes used only for clicking / hovering zones. */
const HIT: { zone: ZoneId; position: V3; scale: V3 }[] = [
  { zone: 'head', position: [0, 1.63, 0.01], scale: [0.1, 0.13, 0.11] },
  { zone: 'heart', position: [0.022, 1.285, 0.06], scale: [0.065, 0.07, 0.06] },
  { zone: 'lungs', position: [0.08, 1.3, 0], scale: [0.07, 0.12, 0.08] },
  { zone: 'lungs', position: [-0.08, 1.3, 0], scale: [0.07, 0.12, 0.08] },
  { zone: 'body', position: [0, 1.12, 0], scale: [0.18, 0.32, 0.12] },
  { zone: 'body', position: [0.1, 0.48, 0], scale: [0.09, 0.45, 0.09] },
  { zone: 'body', position: [-0.1, 0.48, 0], scale: [0.09, 0.45, 0.09] },
]

interface Props {
  evaluation: Evaluation
  bpm: number | null
  selected: ZoneId | null
  hovered: ZoneId | null
  onSelect: (z: ZoneId) => void
  onHover: (z: ZoneId | null) => void
}

export function ParticleBody({ evaluation, bpm, hovered, onSelect, onHover }: Props) {
  const root = useRef<THREE.Group>(null)
  const dpr = useThree((s) => s.viewport.dpr)

  const geometry = useMemo(() => {
    const c = sampleBody()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(c.position, 3))
    g.setAttribute('aZone', new THREE.BufferAttribute(c.zone, 1))
    g.setAttribute('aKind', new THREE.BufferAttribute(c.kind, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(c.seed, 1))
    g.setAttribute('aBones', new THREE.BufferAttribute(c.bones, 2))
    g.setAttribute('aWeight', new THREE.BufferAttribute(c.weight, 1))
    // the body moves with the skeleton, so never cull it by its rest bounds
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3)
    return g
  }, [])
  const solver = useMemo(() => new PoseSolver(), [])
  const lastPose = useRef(0)
  const rig = useRef<THREE.Group>(null)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uBeatAge: { value: 10 },
          uBreath: { value: 0 },
          uOffline: { value: 0 },
          uScanY: { value: -10 },
          uPixel: { value: 1 },
          uHover: { value: -1 },
          uHeart: { value: new THREE.Vector3(...HEART_CENTER) },
          uZoneColor: { value: [0, 1, 2, 3].map(() => new THREE.Color(partColor('nominal'))) },
          uZoneAlarm: { value: [0, 0, 0, 0] },
          uBones: { value: Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4()) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  const phase = useRef(0)
  const rate = useRef(bpm ?? 60)
  const target = useMemo(() => new THREE.Color(), [])
  const { zones, overall } = evaluation
  const offline = overall === 'offline'

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const u = material.uniforms

    // skeleton: follow the person when a fresh pose is available, else ease back to rest
    const now = performance.now()
    const live = poseStore.landmarks != null && now - poseStore.at < POSE_STALE_MS
    solver.mirror = poseStore.mirror
    if (live && poseStore.at !== lastPose.current) {
      solver.push(poseStore.landmarks)
      lastPose.current = poseStore.at
    }
    solver.follow += ((live ? 1 : 0) - solver.follow) * (1 - Math.exp(-3 * dt))
    solver.solve()
    const bones = u.uBones.value as THREE.Matrix4[]
    for (let i = 0; i < BONE_COUNT; i++) bones[i].copy(solver.matrices[i])
    if (rig.current) rig.current.position.y = solver.rootY

    if (root.current) {
      const idle = 1 - solver.follow
      // while following someone, turn to a 3/4 view so squats and reaching read in depth
      root.current.rotation.y = Math.sin(t * 0.22) * 0.2 * idle + 0.45 * solver.follow
      root.current.position.y = Math.sin(t * 0.7) * 0.015 * idle
    }

    // heartbeat clock
    const beating = !offline && zones.heart.level !== 'unreliable' && bpm != null
    rate.current += ((bpm ?? 0) - rate.current) * (1 - Math.exp(-2 * dt))
    if (beating) {
      phase.current += (dt * rate.current) / 60
      if (phase.current >= 1) {
        phase.current -= 1
        u.uBeatAge.value = 0
      } else u.uBeatAge.value += dt
    } else u.uBeatAge.value = 10

    const low = zones.lungs.level === 'danger' || zones.lungs.level === 'caution'
    u.uBreath.value = offline ? 0 : Math.sin(t * Math.PI * 2 * (low ? 0.55 : 0.24)) * (low ? 0.5 : 1)
    u.uOffline.value += ((offline ? 1 : 0) - u.uOffline.value) * (1 - Math.exp(-1.5 * dt))
    u.uTime.value = t
    u.uScanY.value = MODEL_Y + scanHeight(t)
    // keep particles the same size on screen when the camera sits farther back (phones)
    u.uPixel.value = dpr * Math.max(1, state.camera.position.length() / 4.1) * (state.size.width < 860 ? 1.35 : 1)
    u.uHover.value = hovered && hovered !== 'cabin' ? ZONE_INDEX[hovered] : -1

    for (const z of ['head', 'heart', 'lungs', 'body'] as const) {
      const i = ZONE_INDEX[z]
      target.set(partColor(zones[z].level))
      ;(u.uZoneColor.value as THREE.Color[])[i].lerp(target, 1 - Math.exp(-4 * dt))
      ;(u.uZoneAlarm.value as number[])[i] = alarmOf(zones[z].level)
    }
  })

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation()
        const z = pickZone(e)
        if (z) onSelect(z)
      }}
      onPointerMove={(e) => {
        e.stopPropagation()
        const z = pickZone(e)
        if (z !== hovered) onHover(z)
      }}
      onPointerOut={() => onHover(null)}
    >
      <points geometry={geometry} material={material} raycast={() => null} />
      {/* hit areas and readout anchors ride up and down with squats */}
      <group ref={rig}>
        {HIT.map((h, i) => (
          <mesh key={i} position={h.position} scale={h.scale} userData={{ zone: h.zone }}>
            <sphereGeometry args={[1, 12, 10]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        ))}
        {ANCHORS.map((a) => (
          <group key={a.zone} position={a.at} ref={anchorRef(a.zone)} />
        ))}
      </group>
    </group>
  )
}
