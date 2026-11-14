import { LEVEL_COLOR } from '../scene/colors'
import { elRef } from '../scene/labels'
import type { Evaluation, ZoneId } from '../telemetry/types'

interface Props {
  evaluation: Evaluation
  onSelect: (z: ZoneId) => void
  onHover: (z: ZoneId | null) => void
}

const UNIT: Partial<Record<ZoneId, string>> = { heart: 'BPM' }

/**
 * Readouts pinned next to the body. Pulse and SpO₂ are always shown;
 * mind, body and cabin only appear when something is off.
 */
export function Callouts({ evaluation, onSelect, onHover }: Props) {
  const zones: ZoneId[] = ['heart', 'lungs', 'head', 'body', 'cabin']
  return (
    <div className="readouts">
      {zones.map((zone) => {
        const z = evaluation.zones[zone]
        const always = zone === 'heart' || zone === 'lungs'
        const visible = always || (z.level !== 'nominal' && z.level !== 'offline')
        const color = z.level === 'nominal' ? undefined : LEVEL_COLOR[z.level]
        return (
          <button
            key={zone}
            ref={elRef(zone)}
            data-align={zone === 'heart' || zone === 'body' ? 'start' : 'end'}
            className={`readout ${zone} ${visible ? '' : 'is-hidden'}`}
            style={color ? { color } : undefined}
            onClick={(e) => {
              e.currentTarget.blur()
              onSelect(zone)
            }}
            onPointerEnter={() => onHover(zone)}
            onPointerLeave={() => onHover(null)}
            tabIndex={visible ? 0 : -1}
          >
            <span className="readout-value">
              {z.reading}
              {UNIT[zone] && <small>{UNIT[zone]}</small>}
            </span>
            <span className="readout-label">{z.tag}</span>
          </button>
        )
      })}
    </div>
  )
}
