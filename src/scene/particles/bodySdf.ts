// Signed-distance description of a human body (meters, feet at y = 0, facing +z).
// Smooth unions blend the parts into one organic silhouette; particles are then
// sampled on and inside it.

type V = [number, number, number]

const len = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Capsule whose radius tapers linearly from r1 (at a) to r2 (at b). */
function taper(px: number, py: number, pz: number, a: V, b: V, r1: number, r2: number) {
  const bx = b[0] - a[0]
  const by = b[1] - a[1]
  const bz = b[2] - a[2]
  const qx = px - a[0]
  const qy = py - a[1]
  const qz = pz - a[2]
  const h = clamp01((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz))
  return len(qx - bx * h, qy - by * h, qz - bz * h) - (r1 + (r2 - r1) * h)
}

export function ellipsoid(px: number, py: number, pz: number, c: V, r: V) {
  const x = (px - c[0]) / r[0]
  const y = (py - c[1]) / r[1]
  const z = (pz - c[2]) / r[2]
  const k0 = len(x, y, z)
  const k1 = len(x / r[0], y / r[1], z / r[2])
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1
}

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

export function bodySdf(x: number, y: number, z: number) {
  const ax = Math.abs(x)
  let d = ellipsoid(x, y, z, [0, 1.645, 0.005], [0.082, 0.107, 0.097]) // cranium
  d = smin(d, ellipsoid(x, y, z, [0, 1.582, 0.032], [0.06, 0.055, 0.066]), 0.04) // jaw
  d = smin(d, taper(x, y, z, [0, 1.46, -0.008], [0, 1.56, 0], 0.05, 0.046), 0.03) // neck
  d = smin(d, taper(ax, y, z, [0, 1.415, -0.012], [0.17, 1.4, -0.012], 0.062, 0.05), 0.06) // shoulders
  d = smin(d, ellipsoid(x, y, z, [0, 1.29, 0], [0.158, 0.165, 0.104]), 0.06) // ribcage
  d = smin(d, ellipsoid(ax, y, z, [0.07, 1.33, 0.05], [0.07, 0.06, 0.05]), 0.04) // chest
  d = smin(d, ellipsoid(x, y, z, [0, 1.11, 0.012], [0.132, 0.14, 0.094]), 0.06) // abdomen
  d = smin(d, ellipsoid(x, y, z, [0, 0.955, 0], [0.158, 0.1, 0.104]), 0.06) // pelvis
  d = smin(d, taper(ax, y, z, [0.19, 1.385, -0.012], [0.255, 1.12, -0.022], 0.05, 0.037), 0.045) // upper arm
  d = smin(d, taper(ax, y, z, [0.255, 1.12, -0.022], [0.292, 0.875, 0.03], 0.036, 0.025), 0.025) // forearm
  d = smin(d, ellipsoid(ax, y, z, [0.302, 0.8, 0.036], [0.025, 0.066, 0.042]), 0.025) // hand
  d = smin(d, taper(ax, y, z, [0.085, 0.92, 0], [0.1, 0.5, 0.01], 0.082, 0.05), 0.05) // thigh
  d = smin(d, taper(ax, y, z, [0.1, 0.5, 0.01], [0.108, 0.085, -0.016], 0.05, 0.031), 0.03) // shin
  d = smin(d, ellipsoid(ax, y, z, [0.1, 0.36, -0.024], [0.047, 0.1, 0.047]), 0.04) // calf
  d = smin(d, ellipsoid(ax, y, z, [0.11, 0.035, 0.045], [0.041, 0.034, 0.104]), 0.03) // foot
  return d
}

// ---- organs ----
export const HEART_CENTER: V = [0.022, 1.285, 0.05]
export const LUNG_CENTER_Y = 1.3
export const LUNG_X = 0.074

export function heartSdf(x: number, y: number, z: number) {
  const a = ellipsoid(x, y, z, [0.03, 1.27, 0.05], [0.046, 0.058, 0.043])
  const b = ellipsoid(x, y, z, [0.0, 1.302, 0.046], [0.034, 0.034, 0.034])
  return smin(a, b, 0.02)
}

export function lungsSdf(x: number, y: number, z: number) {
  const ax = Math.abs(x)
  return ellipsoid(ax, y, z, [LUNG_X, LUNG_CENTER_Y, -0.006], [0.058, 0.108, 0.068])
}

export function brainSdf(x: number, y: number, z: number) {
  return ellipsoid(x, y, z, [0, 1.668, -0.004], [0.068, 0.062, 0.08])
}

// bones as segments (sampled as thin lines)
export const BONES: [V, V][] = [
  [[0, 0.98, -0.06], [0, 1.52, -0.03]], // spine
  [[0.19, 1.385, -0.012], [0.255, 1.12, -0.022]],
  [[-0.19, 1.385, -0.012], [-0.255, 1.12, -0.022]],
  [[0.255, 1.12, -0.022], [0.292, 0.875, 0.03]],
  [[-0.255, 1.12, -0.022], [-0.292, 0.875, 0.03]],
  [[0.085, 0.92, 0], [0.1, 0.5, 0.01]],
  [[-0.085, 0.92, 0], [-0.1, 0.5, 0.01]],
  [[0.1, 0.5, 0.01], [0.108, 0.085, -0.016]],
  [[-0.1, 0.5, 0.01], [-0.108, 0.085, -0.016]],
  [[-0.17, 1.41, -0.02], [0.17, 1.41, -0.02]], // clavicles
]
