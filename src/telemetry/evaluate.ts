// Visual status for each body zone, from fixed thresholds and combined rules.
// The server's rule engine remains the source of truth for alerts; this lets
// the view react on its own (and in sim mode).

import {
  LEVEL_RANK,
  type Alert,
  type EnvReading,
  type Evaluation,
  type Level,
  type Received,
  type ZoneId,
  type ZoneState,
} from './types'

export const OFFLINE_MS = 10_000
const PRESSURE_WINDOW_MS = 5 * 60_000
const IMPACT_WINDOW_MS = 120_000
const IMPACT_ESCALATE_MS = 30_000

const worst = (levels: Level[]): Level =>
  levels.reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), 'nominal' as Level)

const offlineZone = (): ZoneState => ({ level: 'offline', reading: '—', tag: 'No signal' })

export function isActive(accMag: number, activity: string) {
  return activity !== 'rest' || accMag > 1.3
}

export function evaluate(
  history: Received[],
  now: number,
  baselineBpm: number,
  impactAckAt: number,
): Evaluation {
  const last = history[history.length - 1]
  const alerts: Alert[] = []

  if (!last || now - last.at > OFFLINE_MS) {
    if (last) {
      alerts.push({
        id: 'no-signal',
        level: 'offline',
        zone: 'body',
        title: 'No signal',
        why: `Nothing from the wristband for ${Math.round((now - last.at) / 1000)} s.`,
        action: 'Check the wristband. Its own alarm still works.',
      })
    }
    return {
      overall: 'offline',
      zones: { head: offlineZone(), heart: offlineZone(), lungs: offlineZone(), body: offlineZone(), cabin: offlineZone() },
      env: [],
      alerts,
      exercising: false,
      baselineBpm,
      coTrap: false,
    }
  }

  const p = last.packet
  const { bpm, spo2, quality } = p.vitals
  const { accMag, activity } = p.motion
  const { tempC, rh, pressureKpa, coPpm, coState } = p.env
  const active = isActive(accMag, activity)
  const vitalsOk = quality === 'ok' && bpm != null && spo2 != null

  // ---------- cabin ----------
  const recent = history.filter((h) => now - h.at <= PRESSURE_WINDOW_MS)
  const maxPressure = Math.max(...recent.map((h) => h.packet.env.pressureKpa))
  const pressureDrop = maxPressure - pressureKpa

  const coReady = coState === 'ready'
  const coLevel: Level = !coReady ? 'unreliable' : coPpm >= 35 ? 'danger' : coPpm >= 9 ? 'caution' : 'nominal'
  const pressLevel: Level =
    pressureKpa < 95 || pressureDrop > 3 ? 'danger' : pressureDrop > 1 ? 'caution' : 'nominal'
  const tempLevel: Level =
    tempC < 15 || tempC > 32 ? 'danger' : tempC < 18 || tempC > 27 ? 'caution' : 'nominal'
  const rhLevel: Level = rh < 15 || rh > 80 ? 'danger' : rh < 25 || rh > 70 ? 'caution' : 'nominal'

  const env: EnvReading[] = [
    { key: 'co', label: 'CO', value: coReady ? coPpm.toFixed(1) : '…', unit: 'ppm', level: coLevel },
    { key: 'pressure', label: 'Pressure', value: pressureKpa.toFixed(1), unit: 'kPa', level: pressLevel },
    { key: 'temp', label: 'Temp', value: tempC.toFixed(1), unit: '°C', level: tempLevel },
    { key: 'rh', label: 'Humidity', value: rh.toFixed(0), unit: '%', level: rhLevel },
  ]

  if (coLevel === 'danger')
    alerts.push({
      id: 'co-danger',
      level: 'danger',
      zone: 'cabin',
      title: 'Carbon monoxide',
      why: `${coPpm.toFixed(0)} ppm in your air.`,
      action: 'Mask on. Tell the crew.',
    })
  else if (coLevel === 'caution')
    alerts.push({
      id: 'co-caution',
      level: 'caution',
      zone: 'cabin',
      title: 'CO rising',
      why: `${coPpm.toFixed(0)} ppm in your air.`,
      action: 'Check for overheating equipment.',
    })

  if (pressLevel === 'danger')
    alerts.push({
      id: 'press-danger',
      level: 'danger',
      zone: 'cabin',
      title: 'Depressurization',
      why: `${pressureKpa.toFixed(1)} kPa, down ${pressureDrop.toFixed(1)}.`,
      action: 'Mask on. Go to the safe haven.',
    })
  else if (pressLevel === 'caution')
    alerts.push({
      id: 'press-caution',
      level: 'caution',
      zone: 'cabin',
      title: 'Pressure dropping',
      why: `Down ${pressureDrop.toFixed(1)} kPa.`,
      action: 'Check for leaks.',
    })

  if (tempLevel !== 'nominal')
    alerts.push({
      id: 'temp',
      level: tempLevel === 'danger' ? 'danger' : 'caution',
      zone: 'cabin',
      title: 'Cabin temperature',
      why: `${tempC.toFixed(1)} °C.`,
      action: 'Adjust thermal control.',
    })
  if (rhLevel !== 'nominal')
    alerts.push({
      id: 'rh',
      level: rhLevel === 'danger' ? 'danger' : 'caution',
      zone: 'cabin',
      title: 'Cabin humidity',
      why: `${rh.toFixed(0)}%.`,
      action: 'Check humidity control.',
    })

  const cabinLevel = worst([coLevel === 'unreliable' ? 'nominal' : coLevel, pressLevel, tempLevel, rhLevel])
  const cabinWorst = [...env].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0]
  const cabin: ZoneState = {
    level: cabinLevel,
    reading: cabinLevel === 'nominal' ? `${pressureKpa.toFixed(1)} kPa` : `${cabinWorst.value} ${cabinWorst.unit}`,
    tag: cabinLevel === 'nominal' ? 'Cabin' : cabinWorst.label,
  }

  // ---------- heart ----------
  let heart: ZoneState
  let exercising = false
  if (!vitalsOk) {
    heart = { level: 'unreliable', reading: '—', tag: 'Pulse' }
    alerts.push({
      id: 'ppg-unreliable',
      level: 'unreliable',
      zone: 'heart',
      title: 'Bad reading',
      why: quality === 'no_finger' ? 'No finger on the sensor.' : 'Too much movement.',
      action: 'Re-seat the sensor and hold still.',
    })
  } else {
    const b = Math.round(bpm as number)
    if (active && b > 100 && b <= 185) {
      exercising = true
      heart = { level: 'nominal', reading: `${b}`, tag: 'Exercise' }
    } else if (b > 130 || b < 40) {
      heart = { level: 'danger', reading: `${b}`, tag: 'Pulse' }
      alerts.push({
        id: 'hr-danger',
        level: 'danger',
        zone: 'heart',
        title: 'Heart rate critical',
        why: `${b} BPM at rest.`,
        action: 'Stop. Call the crew medical officer.',
      })
    } else if (!active && (b > 100 || b < 50)) {
      heart = { level: 'caution', reading: `${b}`, tag: 'Pulse' }
      alerts.push({
        id: 'hr-caution',
        level: 'caution',
        zone: 'heart',
        title: 'Heart rate high',
        why: `${b} BPM at rest.`,
        action: 'Rest 5 minutes, then measure again.',
      })
    } else {
      heart = { level: 'nominal', reading: `${b}`, tag: 'Pulse' }
    }
  }

  // ---------- lungs / blood oxygen ----------
  let lungs: ZoneState
  const coTrap = coLevel === 'danger' && vitalsOk && (spo2 as number) > 94
  if (!vitalsOk) {
    lungs = { level: 'unreliable', reading: '—', tag: 'SpO₂' }
  } else {
    const s = Math.round(spo2 as number)
    const reading = `${s}%`
    if (coLevel === 'danger') {
      lungs = { level: 'danger', reading, tag: coTrap ? 'fooled by CO' : 'SpO₂' }
    } else if (pressLevel !== 'nominal' && s <= 94) {
      lungs = { level: 'danger', reading, tag: 'SpO₂' }
      alerts.push({
        id: 'env-hypoxia',
        level: 'danger',
        zone: 'lungs',
        title: 'Losing oxygen',
        why: 'Pressure and blood oxygen are both falling.',
        action: 'Mask on. Go to the safe haven.',
      })
    } else if (s <= 90) {
      lungs = { level: 'danger', reading, tag: 'SpO₂' }
      alerts.push({
        id: 'spo2-danger',
        level: 'danger',
        zone: 'lungs',
        title: 'Low blood oxygen',
        why: `SpO₂ ${s}%.`,
        action: 'Mask on. Tell the crew.',
      })
    } else if (s <= 94) {
      lungs = { level: 'caution', reading, tag: 'SpO₂' }
      alerts.push({
        id: 'spo2-caution',
        level: 'caution',
        zone: 'lungs',
        title: 'Blood oxygen low',
        why: `SpO₂ ${s}%.`,
        action: 'Breathe slowly. Measure again in 1 minute.',
      })
    } else {
      lungs = { level: 'nominal', reading, tag: 'SpO₂' }
    }
  }

  // ---------- head / behavioral ----------
  let head: ZoneState
  if (!vitalsOk) {
    head = { level: 'unreliable', reading: '—', tag: 'Mind' }
  } else {
    const b = bpm as number
    const pct = Math.round(((b - baselineBpm) / baselineBpm) * 100)
    if (!active && b >= baselineBpm * 1.25) {
      head = { level: 'caution', reading: `+${pct}%`, tag: 'Stress?' }
      alerts.push({
        id: 'stress',
        level: 'caution',
        zone: 'head',
        title: 'Possible stress',
        why: `Pulse ${pct}% above your normal, and you are not moving.`,
        action: 'Two minutes of slow breathing.',
      })
    } else {
      head = { level: 'nominal', reading: 'calm', tag: 'Mind' }
    }
  }

  // ---------- body / motion & impacts ----------
  let body: ZoneState
  const impact = [...history].reverse().find((h) => h.packet.motion.impact && now - h.at < IMPACT_WINDOW_MS)
  const impactActive = impact && impact.at > impactAckAt
  const stillSinceImpact =
    impactActive &&
    history.filter((h) => h.at > impact!.at).every((h) => h.packet.motion.accMag < 1.15 && h.packet.motion.gyroMag < 5)
  if (impactActive && stillSinceImpact) {
    const escalated = now - impact!.at > IMPACT_ESCALATE_MS
    body = { level: escalated ? 'danger' : 'caution', reading: 'impact', tag: 'Body' }
    alerts.push({
      id: 'impact',
      level: escalated ? 'danger' : 'caution',
      zone: 'body',
      title: escalated ? 'No response' : 'Impact. Are you OK?',
      why: 'A hard hit, then no movement.',
      action: escalated ? 'Crew alerted.' : 'Tap if you are fine.',
    })
  } else {
    body = { level: 'nominal', reading: active ? 'active' : 'at rest', tag: 'Body' }
  }

  const zones: Record<ZoneId, ZoneState> = { head, heart, lungs, body, cabin }
  alerts.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])

  return {
    overall: worst(Object.values(zones).map((z) => z.level)),
    zones,
    env,
    alerts,
    exercising,
    baselineBpm,
    coTrap,
  }
}
