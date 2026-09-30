import { describe, expect, it } from 'vitest'
import { julianDay, solarPosition, sunCoordinates, sunriseSunset, sunVector } from './solar'

const delhi = (date: string) => ({ lat: 28.6, lon: 77.2, date })
const IST = 5.5
const hm = (h: number, m: number) => h + m / 60
const MIN = 1 / 60

describe('solar position (NOAA / Meeus)', () => {
  it('matches Meeus worked examples', () => {
    // Meeus ex. 25.a: 1992 Oct 13, 0h TD, apparent declination -7.78507°.
    expect(sunCoordinates(julianDay('1992-10-13')).declination).toBeCloseTo(-7.785, 2)
    // Meeus ex. 28.b: 1992 Oct 13, 0h, equation of time 13m 42.7s.
    expect(sunCoordinates(julianDay('1992-10-13')).equationOfTime).toBeCloseTo(13.712, 1)
  })

  it('solar-noon altitude at 28.6°N: ~84.8° in June, ~38° in December', () => {
    expect(solarPosition(delhi('2026-06-21'), 12).altitude).toBeCloseTo(84.84, 1)
    expect(solarPosition(delhi('2026-12-21'), 12).altitude).toBeCloseTo(37.96, 1)
    expect(solarPosition(delhi('2026-12-21'), 12).azimuth).toBeCloseTo(180, 3)
  })

  it('equinox noon altitude is ~90° - latitude in three cities', () => {
    // 2026-03-20 (equinox 14:46 UTC): 90 - |lat - decl| with decl -0.04° (London) to -0.2° (Sydney, earlier noon in UTC).
    for (const [lat, lon, expected] of [[51.5, -0.13, 38.46], [1.35, 103.8, 88.5], [-33.87, 151.2, 56.3]]) {
      expect(Math.abs(solarPosition({ lat, lon, date: '2026-03-20' }, 12).altitude - expected)).toBeLessThan(0.2)
    }
    // Southern hemisphere: the noon sun is due north.
    expect(solarPosition({ lat: -33.87, lon: 151.2, date: '2026-03-20' }, 12).azimuth).toBeCloseTo(0, 0)
  })

  it('09:00 solar time at the equator on the equinox: 45° high, due east', () => {
    const p = solarPosition({ lat: 0, lon: 0, date: '2026-03-20' }, 9)
    expect(p.altitude).toBeCloseTo(45, 0)
    expect(Math.abs(p.azimuth - 90)).toBeLessThan(0.5)
  })

  it('09:00 IST in Delhi on the June solstice: east-north-east, ~44° high', () => {
    // Hand check: IST 09:00 = 08:40 solar (EoT -1.8 min, lon 77.2 vs 82.5).
    const p = solarPosition(delhi('2026-06-21'), 9, IST)
    expect(p.azimuth).toBeGreaterThan(80)
    expect(p.azimuth).toBeLessThan(88)
    expect(p.altitude).toBeGreaterThan(42)
    expect(p.altitude).toBeLessThan(47)
    // Symmetric about solar noon.
    const am = solarPosition(delhi('2026-06-21'), 9)
    const pm = solarPosition(delhi('2026-06-21'), 15)
    expect(am.altitude).toBeCloseTo(pm.altitude, 2)
    expect(am.azimuth + pm.azimuth).toBeCloseTo(360, 1)
  })

  it('Delhi sunrise and sunset (IST) within 3 minutes of published times', () => {
    const june = sunriseSunset(delhi('2026-06-21'), IST)
    expect(Math.abs(june.sunrise - hm(5, 24))).toBeLessThan(3 * MIN)
    expect(Math.abs(june.sunset - hm(19, 22))).toBeLessThan(3 * MIN)
    const dec = sunriseSunset(delhi('2026-12-21'), IST)
    expect(Math.abs(dec.sunrise - hm(7, 10))).toBeLessThan(3 * MIN)
    expect(Math.abs(dec.sunset - hm(17, 29))).toBeLessThan(3 * MIN)
    // London, equinox, GMT.
    const london = sunriseSunset({ lat: 51.5074, lon: -0.1278, date: '2026-03-20' }, 0)
    expect(Math.abs(london.sunrise - hm(6, 3))).toBeLessThan(3 * MIN)
    expect(Math.abs(london.sunset - hm(18, 13))).toBeLessThan(3 * MIN)
  })

  it('handles polar day and night; the vector points at the sun', () => {
    expect(sunriseSunset({ lat: 80, lon: 0, date: '2026-06-21' })).toEqual({ sunrise: 0, sunset: 24 })
    expect(sunriseSunset({ lat: 80, lon: 0, date: '2026-12-21' })).toEqual({ sunrise: 12, sunset: 12 })
    const [x, y, z] = sunVector({ altitude: 0, azimuth: 90 })
    expect([x, y, z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, -0])
    expect(sunVector({ altitude: 30, azimuth: 180 })[2]).toBeCloseTo(Math.cos(Math.PI / 6)) // south = +z
  })
})
