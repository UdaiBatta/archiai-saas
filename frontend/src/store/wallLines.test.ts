import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore, type Room } from './canvasStore'
import { clampWallDelta, moveWallRun, wallRun } from './wallLines'

const base = { floorLevel: 0, rotation: { x: 0, y: 0, z: 0 }, color: '#000' }
const room = (id: string, x0: number, x1: number, z0: number, z1: number): Room => ({
  ...base, id, label: id, roomType: 'bedroom', objectType: 'room',
  position: { x: (x0 + x1) / 2, y: 1.5, z: (z0 + z1) / 2 }, size: { w: x1 - x0, h: 3, d: z1 - z0 },
})
// Vertical engine wall piece at x, from z0 to z1.
const wall = (id: string, x: number, z0: number, z1: number): Room => ({
  ...base, id, label: 'Wall', roomType: 'wall', objectType: 'wall', derived: 'engine',
  position: { x, y: 1.5, z: (z0 + z1) / 2 }, size: { w: 0.115, h: 3, d: z1 - z0 },
})
const door: Room = { ...base, id: 'd1', label: 'Door', roomType: 'door', objectType: 'door', hostWallId: 'w1', position: { x: 4, y: 1.05, z: 2 }, size: { w: 0.16, h: 2.1, d: 0.9 } }

// Two rows of rooms split on the same line x = 4; the line is two wall pieces.
const PLAN = [
  room('a', 0, 4, 0, 4), room('b', 4, 8, 0, 4),
  room('e', 0, 4, 4, 8), room('f', 4, 8, 4, 8),
  wall('w1', 4, 0, 4), wall('w2', 4, 4, 8), wall('w3', 6, 8, 12), door,
]

describe('wall lines', () => {
  it('joins touching collinear wall pieces into one line with the room edges on it', () => {
    const run = wallRun(PLAN, 'w1')!
    expect(run).toMatchObject({ axis: 'x', at: 4, from: 0, to: 8 })
    expect(run.wallIds.sort()).toEqual(['w1', 'w2'])
    expect(run.edges).toEqual([
      { id: 'a', side: 'max' }, { id: 'b', side: 'min' },
      { id: 'e', side: 'max' }, { id: 'f', side: 'min' },
    ])
  })

  it('moving the line resizes the rooms on both sides and carries its walls and doors', () => {
    const run = wallRun(PLAN, 'w2')!
    const moved = moveWallRun(PLAN, run, 1)
    const get = (id: string) => moved.find((o) => o.id === id)!
    expect(get('a')).toMatchObject({ position: { x: 2.5 }, size: { w: 5 } })
    expect(get('b')).toMatchObject({ position: { x: 6.5 }, size: { w: 3 } })
    expect(get('f').size.w).toBe(3)
    expect(get('w1').position.x).toBe(5)
    expect(get('d1').position.x).toBe(5)
    expect(get('w3')).toBe(PLAN[6])
  })

  it('stops before any room gets narrower than 1 m', () => {
    const run = wallRun(PLAN, 'w1')!
    expect(clampWallDelta(PLAN, run, 9)).toBe(3)
    expect(clampWallDelta(PLAN, run, -9)).toBe(-3)
  })

  it('is not offered for walls drawn by hand', () => {
    expect(wallRun([{ ...PLAN[4], derived: undefined }], 'w1')).toBeNull()
  })
})

describe('store moveWallLine', () => {
  beforeEach(() => useCanvasStore.setState({ rooms: PLAN, activityLog: [], past: [], future: [] }))

  it('previews without history, then commits one undo step', () => {
    const { moveWallLine } = useCanvasStore.getState()
    moveWallLine('w1', 0.5, { base: PLAN })
    expect(useCanvasStore.getState().past).toHaveLength(0)
    moveWallLine('w1', 1, { base: PLAN, commit: true })
    expect(useCanvasStore.getState().rooms.find((r) => r.id === 'a')!.size.w).toBe(5)
    expect(useCanvasStore.getState().past).toHaveLength(1)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.find((r) => r.id === 'a')!.size.w).toBe(4)
  })
})
