import type { PoseLandmark } from './skeleton'

/**
 * Latest pose, shared between the detector loop (outside React) and the
 * render loop (inside the canvas) without re-rendering anything.
 */
export const poseStore = {
  landmarks: null as PoseLandmark[] | null,
  /** performance.now() of the last frame with a person in it */
  at: 0,
  mirror: false,
}

export const POSE_STALE_MS = 600
