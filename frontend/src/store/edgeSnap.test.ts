import { describe, expect, it } from 'vitest'
import { snapToNeighbours } from './edgeSnap'

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
