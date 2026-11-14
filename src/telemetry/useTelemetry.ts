import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { evaluate } from './evaluate'
import { Simulator, type ScenarioId } from './simulator'
import type { LogEntry, Received, TelemetryPacket } from './types'

export type Mode = 'sim' | 'live'
export type LinkStatus = 'idle' | 'connecting' | 'connected' | 'error'

const TICK_MS = 2000
const HISTORY_MAX = 200
const DEFAULT_BASELINE = 68

function readParams() {
  const q = new URLSearchParams(window.location.search)
  return {
    url: q.get('live') ?? '',
    event: q.get('event') ?? 'telemetria',
  }
}

/** Accepts the bare contract packet or a common wrapper ({ data | packet | reading }). */
function unwrap(msg: unknown): TelemetryPacket | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  if (m.vitals && m.env && m.motion) return m as unknown as TelemetryPacket
  for (const k of ['data', 'packet', 'reading', 'lectura']) {
    const inner = m[k] as Record<string, unknown> | undefined
    if (inner && inner.vitals && inner.env && inner.motion) return inner as unknown as TelemetryPacket
  }
  return null
}

export function useTelemetry() {
  const params = useMemo(readParams, [])
  const [mode, setMode] = useState<Mode>(params.url ? 'live' : 'sim')
  const [scenario, setScenarioState] = useState<ScenarioId>('nominal')
  const [history, setHistory] = useState<Received[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [impactAckAt, setImpactAckAt] = useState(0)
  const [log, setLog] = useState<LogEntry[]>([])
  const [liveUrl, setLiveUrl] = useState(params.url)
  const [liveEvent, setLiveEvent] = useState(params.event)
  const [link, setLink] = useState<LinkStatus>('idle')

  const sim = useRef(new Simulator())
  const scenarioRef = useRef(scenario)
  scenarioRef.current = scenario

  const push = useCallback((packet: TelemetryPacket) => {
    setHistory((h) => {
      const next = [...h, { packet, at: Date.now() }]
      return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next
    })
  }, [])

  // clock for "no signal" detection and timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // simulator source
  useEffect(() => {
    if (mode !== 'sim') return
    const emit = () => {
      if (scenarioRef.current !== 'no_signal') push(sim.current.step(scenarioRef.current))
    }
    emit()
    const id = setInterval(emit, TICK_MS)
    return () => clearInterval(id)
  }, [mode, push])

  // live source (backend over Socket.IO)
  useEffect(() => {
    if (mode !== 'live' || !liveUrl) {
      setLink('idle')
      return
    }
    setLink('connecting')
    const socket: Socket = io(liveUrl, { transports: ['websocket', 'polling'], reconnectionDelay: 1000 })
    socket.on('connect', () => setLink('connected'))
    socket.on('disconnect', () => setLink('connecting'))
    socket.on('connect_error', () => setLink('error'))
    socket.on(liveEvent, (msg: unknown) => {
      const p = unwrap(msg)
      if (p) push(p)
    })
    return () => {
      socket.disconnect()
    }
  }, [mode, liveUrl, liveEvent, push])

  const setScenario = useCallback((id: ScenarioId) => {
    if (id === 'impact') sim.current.triggerImpact()
    setScenarioState(id)
  }, [])

  const switchMode = useCallback((m: Mode) => {
    setHistory([])
    setLog([])
    setMode(m)
  }, [])

  // personal resting baseline: mean of the first calm, clean, resting-range readings
  const baselineBpm = useMemo(() => {
    const calm = history
      .map((h) => h.packet)
      .filter(
        (p) =>
          p.vitals.quality === 'ok' &&
          p.vitals.bpm != null &&
          p.vitals.bpm >= 45 &&
          p.vitals.bpm <= 85 &&
          p.motion.activity === 'rest' &&
          !p.motion.impact &&
          (p.env.coState !== 'ready' || p.env.coPpm < 9),
      )
      .slice(0, 10)
    if (calm.length < 4) return DEFAULT_BASELINE
    return calm.reduce((s, p) => s + (p.vitals.bpm as number), 0) / calm.length
  }, [history])

  const evaluation = useMemo(
    () => evaluate(history, now, baselineBpm, impactAckAt),
    [history, now, baselineBpm, impactAckAt],
  )

  // alert log: record alerts as they appear and clear
  const prevAlerts = useRef<Map<string, string>>(new Map())
  const prevExercise = useRef(false)
  useEffect(() => {
    const current = new Map(evaluation.alerts.map((a) => [a.id, a.title]))
    const entries: LogEntry[] = []
    for (const a of evaluation.alerts) {
      if (!prevAlerts.current.has(a.id)) entries.push({ at: Date.now(), level: a.level, text: a.title })
    }
    for (const [id, title] of prevAlerts.current) {
      if (!current.has(id)) entries.push({ at: Date.now(), level: 'info', text: `Resolved · ${title}` })
    }
    if (evaluation.exercising && !prevExercise.current)
      entries.push({ at: Date.now(), level: 'nominal', text: 'Exercise detected · no alert needed' })
    prevExercise.current = evaluation.exercising
    prevAlerts.current = current
    if (entries.length) setLog((l) => [...entries.reverse(), ...l].slice(0, 30))
  }, [evaluation])

  const latest = history[history.length - 1]?.packet ?? null

  return {
    mode,
    switchMode,
    scenario,
    setScenario,
    latest,
    history,
    evaluation,
    log,
    acknowledgeImpact: () => setImpactAckAt(Date.now()),
    liveUrl,
    setLiveUrl,
    liveEvent,
    setLiveEvent,
    link,
  }
}

export type TelemetryState = ReturnType<typeof useTelemetry>
