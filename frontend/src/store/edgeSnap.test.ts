import { describe, expect, it } from 'vitest'
import { joinedTo, nearMisses, snapToNeighbours } from './edgeSnap'

const box = (x: number, z: number, w: number, d: number) => ({ position: { x, y: 1.5, z }, size: { w, h: 3, d }, rotation: { y: 0 } })

describe('snapToNeighbours', () => {
  const other = box(2, 2, 4, 4) // x 0..4, z 0..4

  it('closes a small gap on a move', () => {
    const moved = box(6.2, 2, 4, 4) // x 4.2..8.2
    const snapped = snapToNeighbours(moved, box(7, 2, 4, 4), [other])
    expect(snapped.position.x).toBeCloseTo(6)
  })

  it('pulls out a small overlap on a move', () => {
    const snapped = snapToNeighbours(box(5.85, 2, 4, 4), box(7, 2, 4, 4), [other])
    expect(snapped.position.x).toBeCloseTo(6)
  })

  it('moves only the dragged edge on a resize', () => {
    // Left edge dragged from 5 to 4.2; right edge stays at 9.
    const resized = snapToNeighbours(box(6.6, 2, 4.8, 4), box(7, 2, 4, 4), [other])
    expect(resized.position.x - resized.size.w / 2).toBeCloseTo(4)
    expect(resized.position.x + resized.size.w / 2).toBeCloseTo(9)
  })

  it('leaves far-away rooms alone', () => {
    const moved = box(7, 2, 4, 4)
    expect(snapToNeighbours(moved, box(8, 2, 4, 4), [other])).toBe(moved)
  })
})

describe('near misses', () => {
  const at = (id: string, x: number, z: number, w: number, d: number) => ({ id, ...box(x, z, w, d) })
  const living = at('L', 6, 2, 4, 4) // x 4..8, z 0..4

  it('finds rooms that overlap or leave a gap, with which edge faces them', () => {
    const misses = nearMisses(living, [
      at('over', 2.2, 2, 4, 4), // x 0.2..4.2: overlaps L by 0.2
      at('gap', 6, 5.3, 4, 2), // z 4.3..6.3: 0.3 gap below L
      at('far', 15, 2, 4, 4),
      at('touch', 10, 2, 4, 4), // x 8..12: touches exactly, already a neighbour
    ])
    expect(misses).toEqual([
      { id: 'over', gap: expect.closeTo(-0.2), axis: 'x', side: 'min' },
      { id: 'gap', gap: expect.closeTo(0.3), axis: 'z', side: 'max' },
    ])
  })

  it('joining moves only the facing edge onto the other room', () => {
    const joined = joinedTo(living, { id: 'gap', gap: 0.3, axis: 'z', side: 'max' })!
    expect(joined.position.z - joined.size.d / 2).toBeCloseTo(0)
    expect(joined.position.z + joined.size.d / 2).toBeCloseTo(4.3)
    expect(joinedTo(living, { id: 'x', gap: -3.5, axis: 'x', side: 'max' })).toBeNull()
  })
})
