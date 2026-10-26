import { describe, expect, it } from 'vitest'

import { TRANSITION_MS, easeInOut, explodeOffset, progressAt } from './viewTransition'

const center = { x: 0, z: 0 }

describe('the 3D <-> Top burst', () => {
  it('starts and ends with every room at home', () => {
    for (const room of [{ x: 0, z: 0 }, { x: 6, z: 2 }, { x: -3, z: -4 }]) {
      expect(explodeOffset(room, center, 12, 0).map(Math.abs)).toEqual([0, 0, 0])
      for (const v of explodeOffset(room, center, 12, 1)) expect(v).toBeCloseTo(0, 9)
    }
  })

  it('pushes a room away from the centre and up at mid-flight, outer rooms further', () => {
    const [dx, dy, dz] = explodeOffset({ x: 4, z: 0 }, center, 12, 0.55)
    expect(dx).toBeGreaterThan(0)
    expect(dz).toBeCloseTo(0)
    expect(dy).toBeGreaterThan(0)
    expect(explodeOffset({ x: 6, z: 0 }, center, 12, 0.6)[0]).toBeGreaterThan(explodeOffset({ x: 2, z: 0 }, center, 12, 0.6)[0])
  })

  it('runs for its fixed time, clamped, on an eased curve', () => {
    expect(progressAt(1000, 1000 + TRANSITION_MS / 2)).toBeCloseTo(0.5)
    expect(progressAt(1000, 1000 + TRANSITION_MS * 2)).toBe(1)
    expect(progressAt(1000, 900)).toBe(0)
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
    expect(easeInOut(1)).toBe(1)
  })
})
