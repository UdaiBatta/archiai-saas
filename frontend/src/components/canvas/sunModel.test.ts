import { describe, expect, it } from 'vitest'

import { daylightHours, formatHour, sunAt } from './sunModel'

const delhi = (date: string) => ({ lat: 28.6, lon: 77.2, date })

describe('sunAt, real sun', () => {
  it('is high in June and low in the southern sky in December at noon', () => {
    const [, juneY] = sunAt(12, delhi('2026-06-21')).direction
    expect(juneY).toBeCloseTo(Math.sin((84.84 * Math.PI) / 180), 2)
    const [x, y, z] = sunAt(12, delhi('2026-12-21')).direction
    expect(Math.abs(x)).toBeLessThan(0.01)
    expect(y).toBeCloseTo(Math.sin((37.96 * Math.PI) / 180), 2)
    expect(z).toBeGreaterThan(0.75) // south
    expect(sunAt(12, delhi('2026-12-21')).label).toBe('Sun from the south, 38° high')
  })

  it('rises east, sets west; daylight follows the date', () => {
    expect(sunAt(8, delhi('2026-03-20')).direction[0]).toBeGreaterThan(0.5)
    expect(sunAt(16, delhi('2026-03-20')).direction[0]).toBeLessThan(-0.5)
    const june = daylightHours(delhi('2026-06-21'))
    const dec = daylightHours(delhi('2026-12-21'))
    expect(june.sunset - june.sunrise).toBeGreaterThan(13.5)
    expect(dec.sunset - dec.sunrise).toBeLessThan(10.5)
    expect(daylightHours()).toEqual({ sunrise: 6, sunset: 18 })
  })

  it('never lights from below the horizon', () => {
    expect(sunAt(3, delhi('2026-06-21')).direction[1]).toBeGreaterThan(0)
    expect(sunAt(3, delhi('2026-06-21')).label).toBe('Sun below the horizon')
  })
})

describe('sunAt, fallback arc', () => {
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
