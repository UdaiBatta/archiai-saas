import { describe, expect, it } from 'vitest'

import config from '../../tailwind.config'

function luminance(hex: string) {
  const [red, green, blue] = hex.match(/[\da-f]{2}/gi)!.map((channel) => parseInt(channel, 16) / 255)
  const linear = [red, green, blue].map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('primary accent text contrast', () => {
  it('meets WCAG AA for normal text across ember and accent button states', () => {
    const colors = config.theme?.extend?.colors as {
      graphite: { 950: string }
      accent: { DEFAULT: string; bright: string }
      ember: { DEFAULT: string; soft: string }
    }
    const foreground = colors.graphite[950]

    for (const background of [colors.accent.DEFAULT, colors.accent.bright, colors.ember.DEFAULT, colors.ember.soft]) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
