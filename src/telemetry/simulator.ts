// Built-in simulator: emits packets in the telemetry format
// ("source": "sim"), easing values toward each scenario's targets.

import type { Quality, TelemetryPacket } from './types'

export type ScenarioId =
  | 'nominal'
  | 'exercise'
  | 'stress'
  | 'co_leak'
  | 'depressurization'
  | 'hypoxia'
  | 'impact'
  | 'noisy'
  | 'no_signal'

interface Values {
  bpm: number
  spo2: number
  tempC: number
  rh: number
  pressureKpa: number
  coPpm: number
  accMag: number
  gyroMag: number
}

interface Scenario {
  id: ScenarioId
  label: string
  hint: string
  target: Values
  activity: 'rest' | 'active'
  quality: Quality
}

const BASE: Values = {
  bpm: 68,
  spo2: 98,
  tempC: 23,
  rh: 42,
  pressureKpa: 101.3,
  coPpm: 1.5,
  accMag: 1.0,
  gyroMag: 2,
}

export const SCENARIOS: Scenario[] = [
  { id: 'nominal', label: 'Nominal', hint: 'Everything in range', target: BASE, activity: 'rest', quality: 'ok' },
  {
    id: 'exercise',
    label: 'Exercise',
    hint: 'High pulse + movement = no alert',
    target: { ...BASE, bpm: 138, spo2: 97, accMag: 1.7, gyroMag: 60 },
    activity: 'active',
    quality: 'ok',
  },
  {
    id: 'stress',
    label: 'Stress',
    hint: 'High pulse while still',
    target: { ...BASE, bpm: 96, accMag: 1.0, gyroMag: 1 },
    activity: 'rest',
    quality: 'ok',
  },
  {
    id: 'co_leak',
    label: 'CO leak',
    hint: 'Oximeter keeps saying 98%',
    target: { ...BASE, coPpm: 62, spo2: 98, bpm: 78 },
    activity: 'rest',
    quality: 'ok',
  },
  {
    id: 'depressurization',
    label: 'Depressurization',
    hint: 'Pressure falls, then SpO₂',
    target: { ...BASE, pressureKpa: 91.5, spo2: 87, bpm: 102, tempC: 21.5 },
    activity: 'rest',
    quality: 'ok',
  },
  {
    id: 'hypoxia',
    label: 'Hypoxia',
    hint: 'Blood oxygen drops',
    target: { ...BASE, spo2: 87, bpm: 104 },
    activity: 'rest',
    quality: 'ok',
  },
  {
    id: 'impact',
    label: 'Impact',
    hint: 'Hit + stillness → escalates',
    target: { ...BASE, accMag: 1.0, gyroMag: 0.3 },
    activity: 'rest',
    quality: 'ok',
  },
  {
    id: 'noisy',
    label: 'Bad reading',
    hint: 'Finger moved on the sensor',
    target: BASE,
    activity: 'rest',
    quality: 'noisy',
  },
  {
    id: 'no_signal',
    label: 'Unplug node',
    hint: 'Stops sending packets',
    target: BASE,
    activity: 'rest',
    quality: 'ok',
  },
]

// Max change per tick (one tick ≈ 2 s, like the real node).
const RATE: Values = {
  bpm: 6,
  spo2: 0.8,
  tempC: 0.25,
  rh: 1,
  pressureKpa: 0.7,
  coPpm: 5,
  accMag: 0.35,
  gyroMag: 25,
}

const NOISE: Values = {
  bpm: 1.2,
  spo2: 0.25,
  tempC: 0.05,
  rh: 0.3,
  pressureKpa: 0.03,
  coPpm: 0.2,
  accMag: 0.02,
  gyroMag: 1,
}

const approach = (cur: number, target: number, step: number) =>
  Math.abs(target - cur) <= step ? target : cur + Math.sign(target - cur) * step

const jitter = (amp: number) => (Math.random() * 2 - 1) * amp

export class Simulator {
  private v: Values = { ...BASE }
  private seq = 0
  private readonly bootAt = Date.now()
  private warmupTicks = 3
  private pendingImpact = false
  private lastScenario: ScenarioId = 'nominal'

  triggerImpact() {
    this.pendingImpact = true
  }

  step(id: ScenarioId): TelemetryPacket {
    const sc = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
    if (id !== this.lastScenario) {
      if (id === 'impact') this.pendingImpact = true
      this.lastScenario = id
    }

    for (const k of Object.keys(this.v) as (keyof Values)[]) {
      this.v[k] = approach(this.v[k], sc.target[k], RATE[k])
    }

    const out: Values = { ...this.v }
    for (const k of Object.keys(out) as (keyof Values)[]) out[k] += jitter(NOISE[k])
    out.spo2 = Math.min(100, out.spo2)
    out.coPpm = Math.max(0, out.coPpm)

    let impact = false
    if (this.pendingImpact) {
      impact = true
      out.accMag = 4.8
      out.gyroMag = 180
      this.pendingImpact = false
    }

    const coState = this.warmupTicks > 0 ? 'warming' : 'ready'
    if (this.warmupTicks > 0) this.warmupTicks--

    const now = Date.now()
    const bpmShown = sc.quality === 'noisy' ? out.bpm + jitter(25) : out.bpm
    return {
      deviceId: 'node-01',
      ts: now,
      seq: ++this.seq,
      bootMs: now - this.bootAt,
      source: 'sim',
      vitals: {
        bpm: Math.round(bpmShown),
        spo2: Math.round(out.spo2),
        quality: sc.quality,
      },
      motion: {
        accMag: +out.accMag.toFixed(2),
        gyroMag: +Math.max(0, out.gyroMag).toFixed(1),
        activity: impact ? 'active' : sc.activity,
        impact,
      },
      env: {
        tempC: +out.tempC.toFixed(1),
        rh: +out.rh.toFixed(1),
        pressureKpa: +out.pressureKpa.toFixed(1),
        coPpm: +out.coPpm.toFixed(1),
        coState,
      },
      localAlert: 'none',
    }
  }
}
