import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { useCallback, useEffect, useRef, useState } from 'react'
import { poseStore } from './poseStore'
import { syntheticPose } from './synthetic'

export type PoseSource = 'off' | 'camera' | 'demo'
export type PoseStatus = 'off' | 'loading' | 'tracking' | 'searching' | 'partial' | 'error'

const BASE = import.meta.env.BASE_URL
const WASM = `${BASE}mediapipe/wasm`
const MODEL = `${BASE}mediapipe/pose_landmarker_lite.task`

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM)
  const opts = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  try {
    return await PoseLandmarker.createFromOptions(fileset, opts('GPU'))
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, opts('CPU'))
  }
}

/**
 * Drives poseStore from the webcam (MediaPipe) or from the scripted demo pose.
 * The <video> element is owned by the caller so it can double as a preview.
 */
export function usePose(video: React.RefObject<HTMLVideoElement | null>) {
  const [source, setSource] = useState<PoseSource>('off')
  const [status, setStatus] = useState<PoseStatus>('off')
  const [error, setError] = useState('')
  const [mirror, setMirrorState] = useState(false)
  const statusRef = useRef<PoseStatus>('off')

  const report = useCallback((s: PoseStatus) => {
    if (statusRef.current !== s) {
      statusRef.current = s
      setStatus(s)
    }
  }, [])

  useEffect(() => {
    poseStore.mirror = mirror
  }, [mirror])

  useEffect(() => {
    let raf = 0
    let stopped = false
    let stream: MediaStream | null = null
    let landmarker: PoseLandmarker | null = null

    if (source === 'off') {
      poseStore.landmarks = null
      report('off')
      return
    }

    if (source === 'demo') {
      report('tracking')
      const t0 = performance.now()
      const loop = () => {
        if (stopped) return
        const now = performance.now()
        poseStore.landmarks = syntheticPose((now - t0) / 1000)
        poseStore.at = now
        raf = requestAnimationFrame(loop)
      }
      loop()
      return () => {
        stopped = true
        cancelAnimationFrame(raf)
      }
    }

    // camera
    report('loading')
    setError('')
    ;(async () => {
      try {
        if (!window.isSecureContext) throw new Error('The camera only works on localhost or https.')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        const v = video.current
        if (!v || stopped) return
        v.srcObject = stream
        await v.play()
        landmarker = await createLandmarker()
        if (stopped) return
        report('searching')
        let lastTime = -1
        const loop = () => {
          if (stopped || !landmarker) return
          if (v.readyState >= 2 && v.currentTime !== lastTime) {
            lastTime = v.currentTime
            const now = performance.now()
            const res = landmarker.detectForVideo(v, now)
            const lms = res.worldLandmarks[0]
            if (lms && lms.length >= 33) {
              poseStore.landmarks = lms
              poseStore.at = now
              const legs = Math.min(lms[25].visibility ?? 0, lms[26].visibility ?? 0, lms[27].visibility ?? 0, lms[28].visibility ?? 0)
              report(legs < 0.5 ? 'partial' : 'tracking')
            } else {
              report('searching')
            }
          }
          raf = requestAnimationFrame(loop)
        }
        loop()
      } catch (e) {
        if (stopped) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(/denied|NotAllowed/i.test(msg) ? 'Camera permission was blocked.' : msg)
        report('error')
      }
    })()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      landmarker?.close()
      if (video.current) video.current.srcObject = null
      poseStore.landmarks = null
    }
  }, [source, video, report])

  return {
    source,
    setSource,
    status,
    error,
    mirror,
    setMirror: setMirrorState,
  }
}

export type PoseState = ReturnType<typeof usePose>
