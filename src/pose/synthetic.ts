// Scripted "person" in MediaPipe world-landmark format: two squats with arms
// forward, then arms raised to the sides. Used to test the skeleton without a
// camera and as a fallback demo.

import { J, type PoseLandmark } from './skeleton'

type V = [number, number, number]

const THIGH = Math.hypot(J.kneeL[0] - J.hipL[0], J.kneeL[1] - J.hipL[1], J.kneeL[2] - J.hipL[2])
const SHIN = Math.hypot(J.ankleL[0] - J.kneeL[0], J.ankleL[1] - J.kneeL[1], J.ankleL[2] - J.kneeL[2])
const UPPER = Math.hypot(J.elbowL[0] - J.shoulderL[0], J.elbowL[1] - J.shoulderL[1])
const FORE = Math.hypot(J.wristL[0] - J.elbowL[0], J.wristL[1] - J.elbowL[1])
const TORSO = J.shoulderL[1] - J.hip[1]

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * 2 * x)

export function syntheticPose(t: number): PoseLandmark[] {
  const cycle = 9
  const c = t % cycle
  const squat = c < 5 ? ease(c / 2.5) : 0
  const raise = c >= 5 ? ease((c - 5) / 4) : 0

  // legs (side view in y/z), ankles planted
  const knee = (side: 1 | -1): { ankle: V; knee: V; hip: V } => {
    const ax = J.ankleL[0] * side
    const ankle: V = [ax, J.ankleL[1], J.ankleL[2]]
    const shinLean = squat * 0.75
    const k: V = [J.kneeL[0] * side, ankle[1] + SHIN * Math.cos(shinLean), ankle[2] + SHIN * Math.sin(shinLean)]
    const thighLean = squat * 1.35
    const h: V = [J.hipL[0] * side, k[1] + THIGH * Math.cos(thighLean), k[2] - THIGH * Math.sin(thighLean)]
    return { ankle, knee: k, hip: h }
  }
  const L = knee(1)
  const R = knee(-1)
  const hipMid: V = [0, (L.hip[1] + R.hip[1]) / 2, (L.hip[2] + R.hip[2]) / 2]

  const lean = squat * 0.45
  const sh = (side: 1 | -1): V => [J.shoulderL[0] * side, hipMid[1] + TORSO * Math.cos(lean), hipMid[2] + TORSO * Math.sin(lean)]
  const shL = sh(1)
  const shR = sh(-1)

  // arms: forward during squats, out to the sides when raising
  const arm = (s: V, side: 1 | -1) => {
    const fwd = squat * 1.45
    const out = raise * 2.6
    const dir: V = [Math.sin(out) * side * 0.98 + 0.12 * side, -Math.cos(out) * Math.cos(fwd), Math.sin(fwd) * Math.cos(out)]
    const n = Math.hypot(...dir)
    const d: V = [dir[0] / n, dir[1] / n, dir[2] / n]
    const e: V = [s[0] + d[0] * UPPER, s[1] + d[1] * UPPER, s[2] + d[2] * UPPER]
    const w: V = [e[0] + d[0] * FORE, e[1] + d[1] * FORE, e[2] + d[2] * FORE]
    return { e, w }
  }
  const aL = arm(shL, 1)
  const aR = arm(shR, -1)

  const shMid: V = [0, (shL[1] + shR[1]) / 2, (shL[2] + shR[2]) / 2]
  const head: V = [0, shMid[1] + 0.26, shMid[2] + Math.sin(lean) * 0.1]

  // model space → MediaPipe world (origin between hips, y down, toward camera = −z)
  const mp = (v: V, visibility = 0.99): PoseLandmark => ({
    x: v[0] - hipMid[0],
    y: -(v[1] - hipMid[1]),
    z: -(v[2] - hipMid[2]),
    visibility,
  })

  const lms: PoseLandmark[] = Array.from({ length: 33 }, () => mp(hipMid, 0))
  lms[0] = mp([head[0], head[1] - 0.02, head[2] + 0.09])
  lms[7] = mp([0.07, head[1], head[2]])
  lms[8] = mp([-0.07, head[1], head[2]])
  lms[11] = mp(shL)
  lms[12] = mp(shR)
  lms[13] = mp(aL.e)
  lms[14] = mp(aR.e)
  lms[15] = mp(aL.w)
  lms[16] = mp(aR.w)
  lms[23] = mp(L.hip)
  lms[24] = mp(R.hip)
  lms[25] = mp(L.knee)
  lms[26] = mp(R.knee)
  lms[27] = mp(L.ankle)
  lms[28] = mp(R.ankle)
  return lms
}
