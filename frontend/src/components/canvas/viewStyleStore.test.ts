import { describe, expect, it } from 'vitest'

import { blocksActive, useViewStyle } from './viewStyleStore'

const layout = { studio: true, modelStage: false, style: 'blocks' as const, sunStudy: false }

describe('blocks style', () => {
  it('is the default look while laying out', () => {
    expect(useViewStyle.getState().style).toBe('blocks')
    expect(blocksActive(layout)).toBe(true)
  })

  it('stays out of the model stage, the sun studies, and Model style', () => {
    expect(blocksActive({ ...layout, modelStage: true })).toBe(false)
    expect(blocksActive({ ...layout, sunStudy: true })).toBe(false)
    expect(blocksActive({ ...layout, style: 'model' })).toBe(false)
    expect(blocksActive({ ...layout, studio: false })).toBe(false)
  })
})
