import { describe, expect, it } from 'vitest'
import { parseMasses, parseSite } from './siteTypes'

const square = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }]

describe('parseSite', () => {
  it('fills missing setbacks with 0 and drops non-positive limits', () => {
    const site = parseSite({ boundary: square, rules: { setbacks: [3, -1], maxHeightM: 0, maxCoverage: 0.4, maxFar: 'x' } })
    expect(site?.rules).toEqual({ setbacks: [3, 0, 0, 0], maxHeightM: null, maxCoverage: 0.4, maxFar: null })
  })

  it('keeps a valid location and drops a bad one (older sites have none)', () => {
    expect(parseSite({ boundary: square, location: { lat: 12.9, lon: 77.6 } })?.location).toEqual({ lat: 12.9, lon: 77.6 })
    expect(parseSite({ boundary: square, location: { lat: 95, lon: 0 } })).not.toHaveProperty('location')
    expect(parseSite({ boundary: square })).not.toHaveProperty('location')
  })

  it('rejects malformed boundaries', () => {
    expect(parseSite(undefined)).toBeNull()
    expect(parseSite({ boundary: square.slice(0, 2) })).toBeNull()
    expect(parseSite({ boundary: [...square.slice(0, 2), { x: 'a', z: 1 }] })).toBeNull()
  })
})

describe('parseMasses', () => {
  it('keeps valid masses with sane floors, heights and base', () => {
    const masses = parseMasses([
      { id: 'a', footprint: square, floors: 2.6, floorHeightM: 1, baseM: -2 },
      { id: 'b', footprint: square.slice(0, 2) },
      'junk',
    ])
    expect(masses).toEqual([{ id: 'a', name: 'Mass', footprint: square, floors: 3, floorHeightM: 2, baseM: 0 }])
  })
})
