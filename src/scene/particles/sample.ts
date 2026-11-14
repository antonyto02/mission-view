import { assignBones } from '../../pose/skeleton'
import { BONES, bodySdf, brainSdf, heartSdf, lungsSdf } from './bodySdf'

/** Zone ids shared with the shader. */
export const Z = { head: 0, heart: 1, lungs: 2, body: 3 } as const
/** Particle kinds: skin surface, interior haze, organ, bone. */
export const K = { surface: 0, haze: 1, organ: 2, bone: 3 } as const

// small deterministic PRNG so the body looks the same on every load
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Sdf = (x: number, y: number, z: number) => number
type Box = [number, number, number, number, number, number]

export interface Cloud {
  position: Float32Array
  zone: Float32Array
  kind: Float32Array
  seed: Float32Array
  /** two bone indices per particle */
  bones: Float32Array
  /** weight of the first bone (the second gets 1 − w) */
  weight: Float32Array
  count: number
}

export function sampleBody(): Cloud {
  const rnd = mulberry32(20261114)
  const pos: number[] = []
  const zone: number[] = []
  const kind: number[] = []
  const seed: number[] = []
  const bones: number[] = []
  const weight: number[] = []

  const push = (x: number, y: number, z: number, zn: number, k: number) => {
    pos.push(x, y, z)
    zone.push(zn)
    kind.push(k)
    seed.push(rnd())
    // organs ride rigidly with the torso (heart, lungs) or the head (brain)
    const forced = k === K.organ ? (zn === Z.head ? 1 : 0) : undefined
    const [b0, b1, w] = assignBones(x, y, z, forced)
    bones.push(b0, b1)
    weight.push(w)
  }

  /** Rejection-sample points where the field matches `accept`. */
  const fill = (sdf: Sdf, box: Box, n: number, accept: (d: number) => boolean, zoneOf: (y: number) => number, k: number) => {
    const [x0, y0, z0, x1, y1, z1] = box
    let got = 0
    let tries = 0
    while (got < n && tries < n * 400) {
      tries++
      const x = x0 + rnd() * (x1 - x0)
      const y = y0 + rnd() * (y1 - y0)
      const z = z0 + rnd() * (z1 - z0)
      const d = sdf(x, y, z)
      if (!accept(d)) continue
      push(x, y, z, zoneOf(y), k)
      got++
    }
  }

  const bodyBox: Box = [-0.36, 0, -0.16, 0.36, 1.78, 0.18]
  const headOrBody = (y: number) => (y > 1.525 ? Z.head : Z.body)

  fill(bodySdf, bodyBox, 17000, (d) => Math.abs(d) < 0.0045, headOrBody, K.surface)
  fill(bodySdf, bodyBox, 2600, (d) => d < -0.012, headOrBody, K.haze)
  fill(heartSdf, [-0.05, 1.2, -0.01, 0.1, 1.36, 0.11], 500, (d) => Math.abs(d) < 0.004, () => Z.heart, K.organ)
  fill(heartSdf, [-0.05, 1.2, -0.01, 0.1, 1.36, 0.11], 350, (d) => d < -0.006, () => Z.heart, K.organ)
  fill(lungsSdf, [-0.15, 1.18, -0.08, 0.15, 1.42, 0.07], 2600, (d) => Math.abs(d) < 0.004, () => Z.lungs, K.organ)
  fill(lungsSdf, [-0.15, 1.18, -0.08, 0.15, 1.42, 0.07], 900, (d) => d < -0.01, () => Z.lungs, K.organ)
  fill(brainSdf, [-0.08, 1.6, -0.09, 0.08, 1.74, 0.08], 1500, (d) => Math.abs(d) < 0.004, () => Z.head, K.organ)

  for (const [a, b] of BONES) {
    const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 900)
    for (let i = 0; i < n; i++) {
      const t = rnd()
      const j = () => (rnd() - 0.5) * 0.008
      push(a[0] + (b[0] - a[0]) * t + j(), a[1] + (b[1] - a[1]) * t + j(), a[2] + (b[2] - a[2]) * t + j(), Z.body, K.bone)
    }
  }

  return {
    position: new Float32Array(pos),
    zone: new Float32Array(zone),
    kind: new Float32Array(kind),
    seed: new Float32Array(seed),
    bones: new Float32Array(bones),
    weight: new Float32Array(weight),
    count: zone.length,
  }
}
