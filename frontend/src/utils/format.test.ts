import { describe, expect, it } from 'vitest'

import { formatHours } from './format'

describe('formatHours', () => {
  it('keeps whole hours whole, including the ones that end in zero', () => {
    expect(formatHours(0)).toBe('0 h')
    expect(formatHours(5)).toBe('5 h')
    expect(formatHours(10)).toBe('10 h')
    expect(formatHours(20)).toBe('20 h')
  })

  it('shows fractions with up to two decimals and no trailing zeros', () => {
    expect(formatHours(5.5)).toBe('5.5 h')
    expect(formatHours(6.75)).toBe('6.75 h')
    expect(formatHours(13.5)).toBe('13.5 h')
  })
})
