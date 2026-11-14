// Rest skeleton of the particle body and a small solver that turns MediaPipe
// world landmarks into one matrix per bone.
//
// Model space: meters, feet at y = 0, body facing +z, the body's LEFT side at +x.
// MediaPipe world landmarks: meters, origin between the hips, y down,
// smaller z = closer to the camera.

import * as THREE from 'three'

type V = [number, number, number]

export const J = {
  hip: [0, 0.95, 0] as V,
  neck: [0, 1.46, -0.008] as V,
  headTop: [0, 1.76, 0] as V,
  shoulderL: [0.19, 1.385, -0.012] as V,
  elbowL: [0.255, 1.12, -0.022] as V,
  wristL: [0.292, 0.875, 0.03] as V,
  hipL: [0.085, 0.92, 0] as V,
  kneeL: [0.1, 0.5, 0.01] as V,
  ankleL: [0.108, 0.085, -0.016] as V,
}

const mirrorX = (v: V): V => [-v[0], v[1], v[2]]

/** Bone segments in rest pose. Index = position in uBones[] in the shader. */
export const BONES: { name: string; a: V; b: V; r: number }[] = [
  { name: 'torso', a: J.hip, b: J.neck, r: 0.15 },
  { name: 'head', a: J.neck, b: J.headTop, r: 0.09 },
  { name: 'upperArmL', a: J.shoulderL, b: J.elbowL, r: 0.045 },
  { name: 'forearmL', a: J.elbowL, b: J.wristL, r: 0.035 },
  { name: 'upperArmR', a: mirrorX(J.shoulderL), b: mirrorX(J.elbowL), r: 0.045 },
  { name: 'forearmR', a: mirrorX(J.elbowL), b: mirrorX(J.wristL), r: 0.035 },
  { name: 'thighL', a: J.hipL, b: J.kneeL, r: 0.07 },
  { name: 'shinL', a: J.kneeL, b: J.ankleL, r: 0.045 },
  { name: 'thighR', a: mirrorX(J.hipL), b: mirrorX(J.kneeL), r: 0.07 },
  { name: 'shinR', a: mirrorX(J.kneeL), b: mirrorX(J.ankleL), r: 0.045 },
  { name: 'footL', a: J.ankleL, b: [0.11, 0.0, 0.12], r: 0.04 },
  { name: 'footR', a: mirrorX(J.ankleL), b: [-0.11, 0.0, 0.12], r: 0.04 },
]
export const BONE_COUNT = BONES.length

function segDist(px: number, py: number, pz: number, a: V, b: V) {
  const bx = b[0] - a[0]
  const by = b[1] - a[1]
  const bz = b[2] - a[2]
  const qx = px - a[0]
  const qy = py - a[1]
  const qz = pz - a[2]
  const h = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)))
  return Math.hypot(qx - bx * h, qy - by * h, qz - bz * h)
}

/**
 * Picks the two closest bones for a particle and a blend weight, so joints
 * bend smoothly instead of tearing. Organs are forced onto torso/head.
 */
export function assignBones(x: number, y: number, z: number, forced?: number): [number, number, number] {
  if (forced != null) return [forced, forced, 1]
  let i0 = 0
  let i1 = 0
  let d0 = Infinity
  let d1 = Infinity
  BONES.forEach((bone, i) => {
    // feet only own points that are really at the bottom
    if ((bone.name === 'footL' || bone.name === 'footR') && y > 0.1) return
    const d = segDist(x, y, z, bone.a, bone.b) - bone.r
    if (d < d0) {
      i1 = i0
      d1 = d0
      i0 = i
      d0 = d
    } else if (d < d1) {
      i1 = i
      d1 = d
    }
  })
  const BLEND = 0.035
  const gap = d1 - d0
  const w = gap >= BLEND ? 1 : 0.5 + 0.5 * (gap / BLEND)
  return [i0, i1, w]
}

// ---------------------------------------------------------------------------
// Solver

export interface PoseLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

const LM = {
  nose: 0,
  earL: 7,
  earR: 8,
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
}
const SWAP: Record<number, number> = { 7: 8, 8: 7, 11: 12, 12: 11, 13: 14, 14: 13, 15: 16, 16: 15, 23: 24, 24: 23, 25: 26, 26: 25, 27: 28, 28: 27 }

const v3 = (v: V) => new THREE.Vector3(v[0], v[1], v[2])
const REST = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v3(v)])) as Record<keyof typeof J, THREE.Vector3>
const restDir = (a: THREE.Vector3, b: THREE.Vector3) => b.clone().sub(a).normalize()
const REST_DIR = {
  head: restDir(REST.neck, REST.headTop),
  upperArmL: restDir(REST.shoulderL, REST.elbowL),
  forearmL: restDir(REST.elbowL, REST.wristL),
  upperArmR: restDir(REST.shoulderL.clone().setX(-REST.shoulderL.x), REST.elbowL.clone().setX(-REST.elbowL.x)),
  forearmR: restDir(REST.elbowL.clone().setX(-REST.elbowL.x), REST.wristL.clone().setX(-REST.wristL.x)),
  thighL: restDir(REST.hipL, REST.kneeL),
  shinL: restDir(REST.kneeL, REST.ankleL),
  thighR: restDir(REST.hipL.clone().setX(-REST.hipL.x), REST.kneeL.clone().setX(-REST.kneeL.x)),
  shinR: restDir(REST.kneeL.clone().setX(-REST.kneeL.x), REST.ankleL.clone().setX(-REST.ankleL.x)),
}

/**
 * Stateful solver: smooths the landmarks over time and writes one 4×4 matrix
 * per bone into `out` (column-major, ready for a uniform array).
 */
export class PoseSolver {
  /** 0 = rest pose, 1 = fully following the person. Eased by the caller. */
  follow = 0
  mirror = false
  private smooth: THREE.Vector3[] = Array.from({ length: 33 }, () => new THREE.Vector3())
  private vis: number[] = new Array(33).fill(0)
  private primed = false
  readonly matrices: THREE.Matrix4[] = BONES.map(() => new THREE.Matrix4())
  readonly out = new Float32Array(BONE_COUNT * 16)
  /** Vertical offset applied to the whole body (feet stay on the floor). */
  rootY = 0

  /** Feed a new MediaPipe frame (world landmarks). */
  push(lms: PoseLandmark[] | null, alpha = 0.45) {
    if (!lms) return
    for (let i = 0; i < 33; i++) {
      const src = lms[this.mirror ? (SWAP[i] ?? i) : i]
      if (!src) continue
      // MediaPipe → model space (y up, toward camera = +z)
      const x = (this.mirror ? -1 : 1) * src.x
      const y = -src.y + J.hip[1]
      const z = -src.z
      if (!this.primed) this.smooth[i].set(x, y, z)
      else this.smooth[i].lerp(new THREE.Vector3(x, y, z), alpha)
      this.vis[i] = src.visibility ?? 1
    }
    this.primed = true
  }

  private p(i: number) {
    return this.smooth[i]
  }

  /** Direction between two landmarks, blended toward rest when unseen or not following. */
  private dir(from: number, to: number, rest: THREE.Vector3) {
    const seen = Math.min(this.vis[from], this.vis[to])
    const k = this.primed ? this.follow * THREE.MathUtils.smoothstep(seen, 0.35, 0.7) : 0
    const d = this.p(to).clone().sub(this.p(from))
    if (d.lengthSq() < 1e-8) return rest.clone()
    return rest.clone().lerp(d.normalize(), k).normalize()
  }

  solve() {
    const m = this.matrices
    const q = new THREE.Quaternion()
    const tmp = new THREE.Matrix4()

    // --- torso orientation from shoulders and hips
    const hipMid = this.p(LM.hipL).clone().add(this.p(LM.hipR)).multiplyScalar(0.5)
    const shMid = this.p(LM.shoulderL).clone().add(this.p(LM.shoulderR)).multiplyScalar(0.5)
    const torsoSeen = Math.min(this.vis[LM.shoulderL], this.vis[LM.shoulderR], this.vis[LM.hipL], this.vis[LM.hipR])
    const kT = this.primed ? this.follow * THREE.MathUtils.smoothstep(torsoSeen, 0.35, 0.7) : 0
    const up = new THREE.Vector3(0, 1, 0).lerp(shMid.clone().sub(hipMid).normalize(), kT).normalize()
    const across = new THREE.Vector3(1, 0, 0).lerp(this.p(LM.shoulderL).clone().sub(this.p(LM.shoulderR)).normalize(), kT)
    const xAxis = across.sub(up.clone().multiplyScalar(across.dot(up))).normalize()
    const zAxis = new THREE.Vector3().crossVectors(xAxis, up).normalize()
    const rotT = new THREE.Matrix4().makeBasis(xAxis, up, zAxis)
    const about = (pivot: THREE.Vector3, rot: THREE.Matrix4, to: THREE.Vector3, target: THREE.Matrix4) =>
      target.makeTranslation(to.x, to.y, to.z).multiply(rot).multiply(tmp.makeTranslation(-pivot.x, -pivot.y, -pivot.z))

    about(REST.hip, rotT, REST.hip, m[0])
    const at = (v: THREE.Vector3) => v.clone().applyMatrix4(m[0])

    // --- head follows the ears
    const earMid = this.p(LM.earL).clone().add(this.p(LM.earR)).multiplyScalar(0.5)
    const headSeen = Math.min(this.vis[LM.earL], this.vis[LM.earR])
    const kH = this.primed ? this.follow * THREE.MathUtils.smoothstep(headSeen, 0.35, 0.7) : 0
    const headDir = REST_DIR.head.clone().lerp(earMid.clone().sub(shMid).normalize(), kH).normalize()
    const neckNow = at(REST.neck)
    q.setFromUnitVectors(REST_DIR.head, headDir)
    about(REST.neck, new THREE.Matrix4().makeRotationFromQuaternion(q), neckNow, m[1])

    // --- limbs: swing each bone so it points where the person's limb points
    const limb = (
      idx: number,
      restA: THREE.Vector3,
      restB: THREE.Vector3,
      startNow: THREE.Vector3,
      from: number,
      to: number,
      rest: THREE.Vector3,
    ) => {
      const d = this.dir(from, to, rest)
      q.setFromUnitVectors(rest, d)
      about(restA, new THREE.Matrix4().makeRotationFromQuaternion(q), startNow, m[idx])
      return startNow.clone().add(d.multiplyScalar(restA.distanceTo(restB)))
    }
    const mx = (v: THREE.Vector3) => v.clone().setX(-v.x)

    const elbowL = limb(2, REST.shoulderL, REST.elbowL, at(REST.shoulderL), LM.shoulderL, LM.elbowL, REST_DIR.upperArmL)
    limb(3, REST.elbowL, REST.wristL, elbowL, LM.elbowL, LM.wristL, REST_DIR.forearmL)
    const elbowR = limb(4, mx(REST.shoulderL), mx(REST.elbowL), at(mx(REST.shoulderL)), LM.shoulderR, LM.elbowR, REST_DIR.upperArmR)
    limb(5, mx(REST.elbowL), mx(REST.wristL), elbowR, LM.elbowR, LM.wristR, REST_DIR.forearmR)

    const kneeL = limb(6, REST.hipL, REST.kneeL, at(REST.hipL), LM.hipL, LM.kneeL, REST_DIR.thighL)
    const ankleL = limb(7, REST.kneeL, REST.ankleL, kneeL, LM.kneeL, LM.ankleL, REST_DIR.shinL)
    const kneeR = limb(8, mx(REST.hipL), mx(REST.kneeL), at(mx(REST.hipL)), LM.hipR, LM.kneeR, REST_DIR.thighR)
    const ankleR = limb(9, mx(REST.kneeL), mx(REST.ankleL), kneeR, LM.kneeR, LM.ankleR, REST_DIR.shinR)

    // feet keep their orientation and just follow the ankles
    m[10].makeTranslation(ankleL.x - REST.ankleL.x, ankleL.y - REST.ankleL.y, ankleL.z - REST.ankleL.z)
    m[11].makeTranslation(ankleR.x + REST.ankleL.x, ankleR.y - REST.ankleL.y, ankleR.z - REST.ankleL.z)

    // --- keep the lowest foot on the floor: bending the knees lowers the body
    this.rootY = REST.ankleL.y - Math.min(ankleL.y, ankleR.y)
    const lift = new THREE.Matrix4().makeTranslation(0, this.rootY, 0)
    for (let i = 0; i < BONE_COUNT; i++) {
      m[i].premultiply(lift)
      m[i].toArray(this.out, i * 16)
    }
  }
}
