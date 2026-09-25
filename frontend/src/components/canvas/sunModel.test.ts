import { describe, expect, it } from 'vitest'

import { formatHour, sunAt } from './sunModel'

describe('sunAt', () => {
  it('rises in the east, is highest and southern at noon, sets in the west', () => {
    const [mx, my] = sunAt(7).direction
    expect(mx).toBeGreaterThan(0.8) // x = east
    expect(my).toBeLessThan(0.4)

    const [nx, ny, nz] = sunAt(12).direction
    expect(Math.abs(nx)).toBeLessThan(0.01)
    expect(ny).toBeGreaterThan(0.85)
    expect(nz).toBeGreaterThan(0) // z = south: the noon sun is in the southern sky

    expect(sunAt(17).direction[0]).toBeLessThan(-0.8) // west
  })

  it('is warm and dim at sunrise, bright at noon', () => {
    expect(sunAt(6).intensity).toBeLessThan(sunAt(12).intensity)
    expect(sunAt(6).color).toBe('rgb(255, 176, 112)')
  })

  it('clamps to daylight hours and formats times', () => {
    expect(sunAt(3).direction).toEqual(sunAt(6).direction)
    expect(formatHour(9.5)).toBe('09:30')
  })
})
