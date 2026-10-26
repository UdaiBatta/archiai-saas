import { describe, expect, it } from 'vitest'

import { blockFill } from './blockGeometry'
import { BLOCKS_MAX_POLAR_ANGLE, BLOCK_COLORS, DEFAULT_LAYOUT_PRESET } from './modelView'

const channel = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const room = (roomType: string) => ({ objectType: 'room' as const, roomType, label: roomType })
const TYPES = ['bedroom', 'master_bedroom', 'living', 'kitchen', 'dining', 'bathroom', 'study', 'corridor', 'utility', 'room']

describe('block planning palette (plan 005)', () => {
  it('gives each room type one stable colour, and different types different colours', () => {
    expect(blockFill(room('Bedroom'), false)).toBe(blockFill(room('bedroom'), false))
    expect(new Set(TYPES.map((type) => blockFill(room(type), false))).size).toBe(TYPES.length)
  })

  it('keeps every room colour readable on the dark ground (3:1)', () => {
    for (const type of TYPES) {
      expect(contrast(blockFill(room(type), false), BLOCK_COLORS.ground), type).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('block planning camera', () => {
  it('opens plans in axonometric', () => {
    expect(DEFAULT_LAYOUT_PRESET).toBe('axo')
  })

  it('keeps the orbiting camera at least 20 degrees above the ground', () => {
    expect(90 - (BLOCKS_MAX_POLAR_ANGLE * 180) / Math.PI).toBeCloseTo(20, 5)
  })
})
