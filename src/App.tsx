import { useEffect, useRef, useState } from 'react'
import { usePose } from './pose/usePose'
import { Scene } from './scene/Scene'
import { SCENARIOS } from './telemetry/simulator'
import type { ZoneId } from './telemetry/types'
import { useTelemetry } from './telemetry/useTelemetry'
import { Callouts } from './ui/Callouts'
import { AlertMessage, PoseControls, SimBar, StatusBar, ZoneCard } from './ui/Hud'

export default function App() {
  const t = useTelemetry()
  const video = useRef<HTMLVideoElement>(null)
  const pose = usePose(video)
  const [selected, setSelected] = useState<ZoneId | null>(null)
  const [hovered, setHovered] = useState<ZoneId | null>(null)
  const [simBar, setSimBar] = useState(true)
  const { evaluation } = t
  const top = evaluation.alerts[0]

  // presenter shortcuts: 1–9 scenarios · H hide controls · C camera · P demo moves · M mirror · Esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const k = e.key.toLowerCase()
      const n = Number(e.key)
      if (n >= 1 && n <= SCENARIOS.length && t.mode === 'sim') t.setScenario(SCENARIOS[n - 1].id)
      else if (k === 'h') setSimBar((v) => !v)
      else if (k === 'c') pose.setSource(pose.source === 'camera' ? 'off' : 'camera')
      else if (k === 'p') pose.setSource(pose.source === 'demo' ? 'off' : 'demo')
      else if (k === 'm') pose.setMirror(!pose.mirror)
      else if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t.mode, t.setScenario, pose])

  const toggle = (z: ZoneId) => setSelected((cur) => (cur === z ? null : z))
  const camOn = pose.source === 'camera'

  return (
    <div className={`app lvl-${evaluation.overall}`}>
      <Scene
        evaluation={evaluation}
        bpm={t.latest?.vitals.bpm ?? null}
        selected={selected}
        hovered={hovered}
        onSelect={toggle}
        onHover={setHovered}
      />
      <Callouts evaluation={evaluation} onSelect={toggle} onHover={setHovered} />
      <div className="edge" aria-hidden />
      <StatusBar evaluation={evaluation} mode={t.mode} link={t.link} />
      <AlertMessage alert={top} coTrap={evaluation.coTrap} onAckImpact={t.acknowledgeImpact} />
      {selected && <ZoneCard zone={selected} evaluation={evaluation} onClose={() => setSelected(null)} />}
      <video
        ref={video}
        className={`pose-preview ${camOn && simBar ? '' : 'is-off'} ${pose.mirror ? '' : 'selfie'}`}
        muted
        playsInline
        aria-hidden
      />
      {simBar && (
        <SimBar
          mode={t.mode}
          onMode={t.switchMode}
          scenario={t.scenario}
          onScenario={t.setScenario}
          liveUrl={t.liveUrl}
          liveEvent={t.liveEvent}
          onLive={(url, ev) => {
            t.setLiveUrl(url)
            t.setLiveEvent(ev)
          }}
          link={t.link}
        >
          <PoseControls pose={pose} />
        </SimBar>
      )}
    </div>
  )
}
