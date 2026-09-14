import { describe, expect, it } from 'vitest'

import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { EDITOR_PALETTE } from './editorPalette'
import { roomVisualTreatment } from './roomVisualTreatment'

describe('roomVisualTreatment', () => {
  it('gives selected spaces the white selection accent and greater solidity', () => {
    const idle = roomVisualTreatment(COMPONENT_REGISTRY.room, 'room', false, false)
    const selected = roomVisualTreatment(COMPONENT_REGISTRY.room, 'room', true, false)

    expect(idle.opacity).toBeLessThan(0.5)
    expect(idle.depthWrite).toBe(false)
    expect(selected.opacity).toBeGreaterThan(idle.opacity)
    expect(selected.emissive).toBe('#ffffff')
    expect(selected.edgeColor).toBe('#ffffff')
  })

  it('keeps glazing translucent and prevents it from hiding geometry behind it', () => {
    const window = roomVisualTreatment(
      COMPONENT_REGISTRY.window,
      'window',
      false,
      false,
    )

    expect(window.opacity).toBeLessThan(0.5)
    expect(window.depthWrite).toBe(false)
    expect(window.roughness).toBeLessThan(
      roomVisualTreatment(COMPONENT_REGISTRY.room, 'room', false, false).roughness,
    )
  })

  it('uses the shared danger treatment for rooms with hard violations', () => {
    const invalid = roomVisualTreatment(
      COMPONENT_REGISTRY.room,
      'room',
      true,
      false,
      true,
    )

    expect(invalid.emissive).toBe(EDITOR_PALETTE.invalid)
    expect(invalid.emissiveIntensity).toBeGreaterThan(0.2)
    expect(invalid.edgeColor).toBe(EDITOR_PALETTE.invalid)
  })
})
