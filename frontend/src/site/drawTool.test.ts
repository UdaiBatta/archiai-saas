import { describe, expect, it } from 'vitest'
import { drawStep, type DrawResult } from './drawTool'

const click = (x: number, z: number) => ({ type: 'click' as const, point: { x, z }, tolerance: 0.5 })
const pts = (r: DrawResult) => (r.status === 'drawing' ? r.points : [])

describe('drawStep', () => {
  it('adds corners and closes on the first corner once there are three', () => {
    let points = pts(drawStep([], click(0, 0)))
    points = pts(drawStep(points, click(0.2, 0.1))) // too close to the last: ignored
    expect(points).toHaveLength(1)
    points = pts(drawStep(points, click(10, 0)))
    expect(drawStep(points, click(0.1, 0))).toEqual({ status: 'drawing', points: [...points, { x: 0.1, z: 0 }] }) // only 2 so far
    points = pts(drawStep(points, click(10, 8)))
    expect(drawStep(points, click(0.3, -0.2))).toEqual({ status: 'closed', boundary: points })
  })

  it('closes on double-click with 3+ corners and cancels on Escape', () => {
    const three = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]
    expect(drawStep(three, { type: 'doubleClick' })).toEqual({ status: 'closed', boundary: three })
    expect(drawStep(three.slice(0, 2), { type: 'doubleClick' }).status).toBe('drawing')
    expect(drawStep(three, { type: 'cancel' })).toEqual({ status: 'cancelled' })
  })
})
