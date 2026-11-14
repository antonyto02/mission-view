import type { Level } from '../telemetry/types'

/** Body and rings when everything is fine: quiet, neutral. */
export const NEUTRAL = '#8fa3b8'

/** Status colors. Used only where something needs attention. */
export const LEVEL_COLOR: Record<Level, string> = {
  nominal: '#6fcf97',
  unreliable: '#7b8593',
  caution: '#f2a93b',
  danger: '#ff4b4b',
  offline: '#4e5560',
}

/** Color for a body part: neutral while nominal, status color otherwise. */
export const partColor = (level: Level) => (level === 'nominal' ? NEUTRAL : LEVEL_COLOR[level])

export const LEVEL_WORD: Record<Level, string> = {
  nominal: 'Nominal',
  unreliable: 'Check sensor',
  caution: 'Caution',
  danger: 'Warning',
  offline: 'No signal',
}
