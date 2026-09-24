import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from './canvasStore'
import { snapDoorToWall, upsertConnection } from './connections'

const base = { floorLevel: 0, rotation: { x: 0, y: 0, z: 0 }, color: '#000' }
const room = (id: string, x: number): Room => ({
  ...base, id, label: id, roomType: 'bedroom', objectType: 'room',
  position: { x, y: 1.5, z: 2 }, size: { w: 4, h: 3, d: 4 },
})
// Vertical wall at x=4 running z 0..4 between rooms a and b.
const WALL: Room = {
  ...base, id: 'w1', label: 'Wall', roomType: 'wall', objectType: 'wall',
  position: { x: 4, y: 1.5, z: 2 }, size: { w: 0.115, h: 3, d: 4 }, betweenRooms: ['a', 'b'],
}
const DOOR: Room = {
  ...base, id: 'd1', label: 'Door', roomType: 'door', objectType: 'door', hostWallId: 'w1',
  position: { x: 4, y: 1.05, z: 2 }, size: { w: 0.16, h: 2.1, d: 0.9 },
}

describe('connection helpers', () => {
  it('replaces the choice for a pair regardless of order', () => {
    const first = upsertConnection([], 'a', 'b', 'open')
    const second = upsertConnection(first, 'b', 'a', 'wall')
    expect(second).toEqual([{ room_a: 'b', room_b: 'a', kind: 'wall', at: null }])
  })

  it('keeps a dragged door on its wall and inside its ends', () => {
    // Dragged off the wall (x=9) and past its far end (z=10).
    const snapped = snapDoorToWall(DOOR, WALL, { x: 9, z: 10 })
    expect(snapped.position).toEqual({ x: 4, y: 1.05, z: 3.55 })
    expect(snapped.at).toBe(0.888)
  })
})

describe('canvas store connections', () => {
  beforeEach(() => {
    useCanvasStore.setState({
      rooms: [room('a', 2), room('b', 6), WALL, DOOR],
      floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, footprint: { x: 0, z: 0, w: 8, d: 4 }, rooms: [] }],
      layoutMetadata: {},
      activityLog: [],
      past: [],
      future: [],
    })
  })

  it('records a wall/door/open choice as an undoable edit', () => {
    useCanvasStore.getState().setConnection('a', 'b', 'open')
    expect(useCanvasStore.getState().layoutMetadata.mvpConnections).toEqual([
      { room_a: 'a', room_b: 'b', kind: 'open', at: null },
    ])
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().layoutMetadata.mvpConnections).toBeUndefined()
  })

  it('turns a door drag into a door connection at the new spot', () => {
    useCanvasStore.getState().updateRoom('d1', { position: { x: 5, y: 1.05, z: 0.2 } })
    const door = useCanvasStore.getState().rooms.find((r) => r.id === 'd1')!
    expect(door.position).toMatchObject({ x: 4, z: 0.45 })
    expect(useCanvasStore.getState().layoutMetadata.mvpConnections).toEqual([
      { room_a: 'a', room_b: 'b', kind: 'door', at: 0.113 },
    ])
  })
})
