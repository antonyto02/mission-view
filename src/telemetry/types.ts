// Telemetry contract — copied from the team brief, section 6.
// The ESP32 node, the team's simulator and this page all speak this shape.

export type Quality = 'ok' | 'noisy' | 'no_finger'
export type CoState = 'warming' | 'heating' | 'ready'

export interface TelemetryPacket {
  deviceId: string
  ts: number
  seq: number
  bootMs?: number
  source: 'device' | 'sim'
  vitals: { bpm: number | null; spo2: number | null; quality: Quality }
  motion: { accMag: number; gyroMag: number; activity: string; impact: boolean }
  env: { tempC: number; rh: number; pressureKpa: number; coPpm: number; coState: CoState }
  localAlert: string
}

export type Level = 'nominal' | 'unreliable' | 'caution' | 'danger' | 'offline'

export const LEVEL_RANK: Record<Level, number> = {
  nominal: 0,
  unreliable: 1,
  caution: 2,
  offline: 2.5,
  danger: 3,
}

export type ZoneId = 'head' | 'heart' | 'lungs' | 'body' | 'cabin'

export interface ZoneState {
  level: Level
  /** Short reading shown on the 3D label, e.g. "72 BPM". */
  reading: string
  /** One-word status for the label, e.g. "STRESS". */
  tag: string
}

export interface Alert {
  id: string
  level: Exclude<Level, 'nominal'>
  zone: ZoneId
  title: string
  why: string
  action: string
}

export interface EnvReading {
  key: 'co' | 'pressure' | 'temp' | 'rh'
  label: string
  value: string
  unit: string
  level: Level
}

export interface Evaluation {
  overall: Level
  zones: Record<ZoneId, ZoneState>
  env: EnvReading[]
  alerts: Alert[]
  exercising: boolean
  baselineBpm: number
  /** True when CO is dangerous while the oximeter still looks fine. */
  coTrap: boolean
}

export interface Received {
  packet: TelemetryPacket
  /** Local receive time; the device clock may not be synced (no NTP). */
  at: number
}

export interface LogEntry {
  at: number
  level: Level | 'info'
  text: string
}
