import { describe, expect, it } from 'vitest'
import { edgeLabels, frontEdgeIndex, streetDirection, moveCorner, outwardNormal, plotBoundary, withBoundary } from './siteEdit'
import { emptyRules, type Site } from './siteTypes'

const rect = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 30 }, { x: 0, z: 30 }]
const site: Site = { boundary: rect, rules: { ...emptyRules(4), setbacks: [6, 1.5, 3, 0], maxHeightM: 12 } }

describe('plotBoundary', () => {
  it('prefers the engine polygon boundary, else the footprint rectangle', () => {
    const meta = { mvpRequirements: { plot: { boundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 8 }] } } }
    expect(plotBoundary(meta, { x: 0, z: 0, w: 12, d: 15 })).toEqual([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 8 }])
    expect(plotBoundary({}, { x: 1, z: 2, w: 12, d: 15 })).toEqual([{ x: 1, z: 2 }, { x: 13, z: 2 }, { x: 13, z: 17 }, { x: 1, z: 17 }])
    expect(plotBoundary({ mvpRequirements: { plot: { boundary: null } } }, undefined)).toBeNull()
  })
})

describe('withBoundary', () => {
  it('keeps rules when the edge count matches, else resets them', () => {
    const moved = rect.map((p) => ({ x: p.x + 1, z: p.z }))
    expect(withBoundary(site, moved).rules).toBe(site.rules)
    expect(withBoundary(site, rect.slice(0, 3)).rules).toEqual(emptyRules(3))
    expect(withBoundary(null, rect).rules).toEqual(emptyRules(4))
  })
})

describe('edges', () => {
  it('finds outward normals in either winding', () => {
    expect(outwardNormal(rect, 0)).toEqual({ x: 0, z: -1 })
    const reversed = [...rect].reverse() // edge 0 now runs along the south side, z = 30
    const n = outwardNormal(reversed, 0)
    expect({ x: n.x + 0, z: n.z + 0 }).toEqual({ x: 0, z: 1 })
    const w = outwardNormal(reversed, 3) // (0,0) -> (0,30): west side
    expect({ x: w.x + 0, z: w.z + 0 }).toEqual({ x: -1, z: 0 })
  })

  it('places labels inside the setback strip, at least minOffset in', () => {
    const labels = edgeLabels(site)
    expect(labels.map((l) => l.text)).toEqual(['6.0 m', '1.5 m', '3.0 m', '0.0 m'])
    expect(labels[0].point).toEqual({ x: 10, z: 3 })
    expect(labels[1].point.x).toBeCloseTo(19.2)
    expect(labels[2].point).toEqual({ x: 10, z: 28.5 })
    expect(labels[3].point.x).toBeCloseTo(0.8)
  })

  it('picks the edge facing the street direction', () => {
    expect(frontEdgeIndex(rect, { x: 1, z: 0 })).toBe(1) // east
    expect(frontEdgeIndex(rect, { x: 0, z: -1 })).toBe(0) // north
    expect(frontEdgeIndex(rect, null)).toBeNull()
    expect(streetDirection({ mvpRequirements: { facing: 'east' } })).toEqual({ x: 1, z: 0 })
    // Orientation block wins: entry wall at the front (screen top) facing south.
    expect(streetDirection({ orientation: { facingDirection: 'S', entryWall: 'front' }, mvpRequirements: { facing: 'east' } })).toEqual({ x: 0, z: -1 })
    expect(streetDirection({})).toBeNull()
  })

  it('moves one corner', () => {
    expect(moveCorner(site, 2, { x: 25, z: 30 }).boundary[2]).toEqual({ x: 25, z: 30 })
    expect(site.boundary[2]).toEqual({ x: 20, z: 30 })
  })
})
