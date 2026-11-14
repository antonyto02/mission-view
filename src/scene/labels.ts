import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// 3D anchor points (inside the scene) and the DOM callouts that follow them.
// Plain DOM keeps the labels crisp and avoids extra React roots inside the canvas.
export const labelAnchors = new Map<string, THREE.Object3D>()
export const labelEls = new Map<string, HTMLElement>()

export const anchorRef = (id: string) => (o: THREE.Object3D | null) => {
  if (o) labelAnchors.set(id, o)
  else labelAnchors.delete(id)
}

export const elRef = (id: string) => (el: HTMLElement | null) => {
  if (el) labelEls.set(id, el)
  else labelEls.delete(id)
}

const v = new THREE.Vector3()

/** Projects every anchor to screen space each frame and moves its DOM label. */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const [id, obj] of labelAnchors) {
      const el = labelEls.get(id)
      if (!el) continue
      obj.getWorldPosition(v)
      v.project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      // data-align="start": label begins at the anchor · "end": label ends at it
      const ax = el.dataset.align === 'end' ? '-100%' : el.dataset.align === 'start' ? '0%' : '-50%'
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${ax}, -50%)`
      el.style.visibility = v.z > 1 ? 'hidden' : 'visible'
    }
  })
  return null
}
