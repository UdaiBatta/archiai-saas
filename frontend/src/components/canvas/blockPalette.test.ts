import { describe, expect, it } from 'vitest'

import { ZONE_ORDER } from './editorPalette'
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
/** CIE L*a*b* (D65), for colour distance. */
const lab = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}
const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))

describe('block planning palette (plan 005)', () => {
  const zones = Object.entries(BLOCK_COLORS.zone)

  it('has a colour for every zone the editor knows', () => {
    expect(Object.keys(BLOCK_COLORS.zone).sort()).toEqual([...ZONE_ORDER].sort())
  })

  it('keeps every pair of zones clearly apart (delta-E 10 or more)', () => {
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        expect(deltaE(zones[i][1], zones[j][1]), `${zones[i][0]} vs ${zones[j][0]}`).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('does not wash out against the ground (1.5:1), except the deliberately pale Unassigned', () => {
    for (const [zone, colour] of zones) {
      if (zone === 'unassigned') continue
      expect(contrast(colour, BLOCK_COLORS.ground), zone).toBeGreaterThanOrEqual(1.5)
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
