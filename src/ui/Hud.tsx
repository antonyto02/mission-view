import { useState } from 'react'
import { ZONES } from '../content/zones'
import { LEVEL_COLOR, LEVEL_WORD } from '../scene/colors'
import type { PoseSource, PoseState, PoseStatus } from '../pose/usePose'
import { SCENARIOS, type ScenarioId } from '../telemetry/simulator'
import type { Alert, Evaluation, ZoneId } from '../telemetry/types'
import type { LinkStatus, Mode } from '../telemetry/useTelemetry'

export function StatusBar({ evaluation, mode, link }: { evaluation: Evaluation; mode: Mode; link: LinkStatus }) {
  const level = evaluation.overall
  return (
    <header className="status">
      <span className="status-word" style={{ color: LEVEL_COLOR[level] }}>
        <i className="dot" />
        {LEVEL_WORD[level]}
      </span>
      <span className="status-src">{mode === 'sim' ? 'Simulated data' : `Live · ${link}`}</span>
    </header>
  )
}

export function AlertMessage({ alert, coTrap, onAckImpact }: { alert: Alert | undefined; coTrap: boolean; onAckImpact: () => void }) {
  if (!alert) return null
  return (
    <div className={`message lvl-${alert.level}`} role="alert" style={{ ['--c' as string]: LEVEL_COLOR[alert.level] }}>
      <div className="message-title">{alert.title}</div>
      <div className="message-action">{alert.action}</div>
      {coTrap && alert.id === 'co-danger' && <div className="message-note">Your oximeter can’t see CO. Ignore its 98%.</div>}
      {alert.id === 'impact' && (
        <button className="message-btn" onClick={onAckImpact}>
          I’m OK
        </button>
      )}
    </div>
  )
}

export function ZoneCard({ zone, evaluation, onClose }: { zone: ZoneId; evaluation: Evaluation; onClose: () => void }) {
  const info = ZONES[zone]
  const state = evaluation.zones[zone]
  const alert = evaluation.alerts.find((a) => a.zone === zone)
  const color = state.level === 'nominal' ? undefined : LEVEL_COLOR[state.level]
  return (
    <aside className="card" aria-label={info.title}>
      <button className="card-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="card-title">{info.title}</div>
      {zone === 'cabin' ? (
        <div className="card-env">
          {evaluation.env.map((r) => (
            <div key={r.key} style={r.level === 'nominal' ? undefined : { color: LEVEL_COLOR[r.level] }}>
              <b>
                {r.value}
                <small>{r.unit}</small>
              </b>
              <span>{r.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-value" style={color ? { color } : undefined}>
          {state.reading}
        </div>
      )}
      <p className="card-why">{alert ? alert.why : info.why}</p>
      <div className="card-meta">
        NASA hazard · {info.hazard}
        <span>{info.sensor}</span>
      </div>
    </aside>
  )
}

const POSE_HINT: Record<PoseStatus, string> = {
  off: '',
  loading: 'Loading pose model…',
  searching: 'Looking for a person…',
  partial: 'Step back so your legs are in view',
  tracking: 'Tracking',
  error: '',
}

export function PoseControls({ pose }: { pose: PoseState }) {
  const toggle = (s: PoseSource) => pose.setSource(pose.source === s ? 'off' : s)
  return (
    <div className="pose-controls">
      <button className={pose.source === 'camera' ? 'on' : ''} onClick={() => toggle('camera')} title="Follow the person on camera (C)">
        <kbd>C</kbd>Camera
      </button>
      <button className={pose.source === 'demo' ? 'on' : ''} onClick={() => toggle('demo')} title="Scripted moves, no camera (P)">
        <kbd>P</kbd>Demo moves
      </button>
      <button className={pose.mirror ? 'on' : ''} onClick={() => pose.setMirror(!pose.mirror)} title="Mirror left and right (M)">
        <kbd>M</kbd>Mirror
      </button>
      {pose.source !== 'off' && (
        <span className={`pose-hint pose-${pose.status}`}>
          {pose.status === 'error' ? pose.error : POSE_HINT[pose.status]}
        </span>
      )}
    </div>
  )
}

export function SimBar({
  mode,
  onMode,
  scenario,
  onScenario,
  liveUrl,
  liveEvent,
  onLive,
  link,
  children,
}: {
  mode: Mode
  onMode: (m: Mode) => void
  scenario: ScenarioId
  onScenario: (s: ScenarioId) => void
  liveUrl: string
  liveEvent: string
  onLive: (url: string, event: string) => void
  link: LinkStatus
  children?: React.ReactNode
}) {
  const [url, setUrl] = useState(liveUrl)
  const [event, setEvent] = useState(liveEvent)
  return (
    <nav className="simbar" aria-label="Simulator">
      <button className={`simbar-mode ${mode === 'live' ? 'is-live' : ''}`} onClick={() => onMode(mode === 'sim' ? 'live' : 'sim')}>
        {mode === 'sim' ? 'Sim' : 'Live'}
      </button>
      {mode === 'sim' ? (
        SCENARIOS.map((s, i) => (
          <button key={s.id} className={scenario === s.id ? 'on' : ''} onClick={() => onScenario(s.id)} title={s.hint}>
            <kbd>{i + 1}</kbd>
            {s.label}
          </button>
        ))
      ) : (
        <form
          className="simbar-live"
          onSubmit={(e) => {
            e.preventDefault()
            onLive(url.trim(), event.trim() || 'telemetria')
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.0.10:3000" aria-label="Server URL" />
          <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="telemetria" aria-label="Socket.IO event" />
          <button type="submit">Connect</button>
          <span className={`simbar-link link-${link}`}>{link}</span>
        </form>
      )}
      {children && <span className="simbar-divider" />}
      {children}
    </nav>
  )
}
