import { describe, expect, it } from 'vitest'

import { MAX_ROOM_POINTS, insetOutline, outlinePatch, roomOutline, selfIntersects, simplifyOutline } from './roomOutline'

const room = { position: { x: 2, y: 1.5, z: 1 }, size: { w: 4, h: 3, d: 2 }, rotation: { x: 0, y: 0, z: 0 } }
const L = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }]

describe('room outline points', () => {
  it('is the four corners of a box room, the polygon of a shaped one', () => {
    expect(roomOutline(room)).toEqual([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 0, z: 2 }])
    expect(roomOutline({ ...room, polygonVertices: L })).toEqual(L)
  })

  it('drops repeated and straight-line points', () => {
    const noisy = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 0, z: 2 }]
    expect(simplifyOutline(noisy)).toEqual([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 0, z: 2 }])
  })

  it('spots a bow-tie', () => {
    expect(selfIntersects([{ x: 0, z: 0 }, { x: 4, z: 2 }, { x: 4, z: 0 }, { x: 0, z: 2 }])).toBe(true)
    expect(selfIntersects(L)).toBe(false)
  })
})

describe('outlinePatch', () => {
  it('keeps a shaped room as a polygon with its bounding box', () => {
    const patch = outlinePatch(L, room)!
    expect(patch.polygonVertices).toHaveLength(6)
    expect(patch.position).toEqual({ x: 2, y: 1.5, z: 2 })
    expect(patch.size).toMatchObject({ w: 4, d: 4 })
  })

  it('turns an axis-aligned rectangle back into a box room', () => {
    expect(outlinePatch(roomOutline(room), room)!.polygonVertices).toBeUndefined()
  })

  it('refuses crossing edges, slivers and more than the point limit', () => {
    expect(outlinePatch([{ x: 0, z: 0 }, { x: 4, z: 2 }, { x: 4, z: 0 }, { x: 0, z: 2 }], room)).toBeNull()
    expect(outlinePatch([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 8, z: 0 }], room)).toBeNull()
    const many = Array.from({ length: MAX_ROOM_POINTS + 1 }, (_, i) => {
      const a = (i / (MAX_ROOM_POINTS + 1)) * Math.PI * 2
      return { x: Math.cos(a) * 3, z: Math.sin(a) * 3 }
    })
    expect(outlinePatch(many, room)).toBeNull()
    expect(outlinePatch(many.slice(0, MAX_ROOM_POINTS), room)).not.toBeNull()
  })
})

describe('insetOutline', () => {
  it('moves every side in by the same distance, whichever way the points run', () => {
    const square = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }]
    for (const points of [square, [...square].reverse()]) {
      const inset = insetOutline(points, 0.1)
      expect(Math.min(...inset.map((p) => p.x))).toBeCloseTo(0.1)
      expect(Math.max(...inset.map((p) => p.z))).toBeCloseTo(3.9)
    }
    // The L's inner corner moves into the room too.
    expect(insetOutline(L, 0.1)[3]).toEqual({ x: expect.closeTo(1.9), z: expect.closeTo(1.9) })
  })
})
