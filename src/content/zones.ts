// Short copy for the zone card. Hazards follow NASA's Human Research Program
// "5 Hazards of Human Spaceflight": https://www.nasa.gov/hrp/hazards/

import type { ZoneId } from '../telemetry/types'

export interface ZoneInfo {
  title: string
  why: string
  hazard: string
  sensor: string
}

export const ZONES: Record<ZoneId, ZoneInfo> = {
  heart: {
    title: 'Heart',
    why: 'Without gravity, fluids shift toward the head and the heart adapts.',
    hazard: 'Gravity fields',
    sensor: 'MAX30100',
  },
  lungs: {
    title: 'Blood oxygen',
    why: 'A leak lowers pressure, so less oxygen reaches the blood. CO fools the oximeter.',
    hazard: 'Hostile closed environment',
    sensor: 'MAX30100',
  },
  head: {
    title: 'Mind',
    why: 'Months of isolation wear on mood, sleep and focus.',
    hazard: 'Isolation & confinement',
    sensor: 'Pulse + motion',
  },
  body: {
    title: 'Body',
    why: 'In microgravity nobody falls, but people hit hatches and racks.',
    hazard: 'Gravity fields',
    sensor: 'BMI160',
  },
  cabin: {
    title: 'Cabin air',
    why: 'Air does not mix in microgravity. CO has no color and no smell.',
    hazard: 'Hostile closed environment',
    sensor: 'AHT20 · BMP280 · MQ-7',
  },
}
