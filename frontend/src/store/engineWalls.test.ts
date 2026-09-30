import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore, type Room } from './canvasStore'
import { capabilitiesOf } from './componentRegistry'

const base = { rotation: { x: 0, y: 0, z: 0 }, color: '#888', floorLevel: 0 }
const room = (id: string, x: number): Room => ({ ...base, id, label: id, objectType: 'room', roomType: 'bedroom', position: { x, y: 1.5, z: 2 }, size: { w: 4, h: 3, d: 4 } }) as Room
const inner: Room = { ...base, id: 'w-in', label: 'Wall 1', objectType: 'wall', derived: 'engine', separates: ['a', 'b'], position: { x: 4, y: 1.5, z: 2 }, size: { w: 0.15, h: 3, d: 4 } } as Room
const outer: Room = { ...base, id: 'w-out', label: 'Wall 2', objectType: 'wall', derived: 'engine', position: { x: 4, y: 1.5, z: 0 }, size: { w: 8, h: 3, d: 0.15 } } as Room
const door: Room = { ...base, id: 'd1', label: 'Door', objectType: 'door', hostWallId: 'w-in', position: { x: 4, y: 1.05, z: 2 }, size: { w: 0.15, h: 2.1, d: 0.9 } } as Room

beforeEach(() => {
  useCanvasStore.getState().loadRooms([room('a', 2), room('b', 6), inner, outer, door])
})

describe('engine walls', () => {
  it('deleting an interior wall opens it: an open connection, wall and its door gone, one undo back', () => {
    useCanvasStore.getState().deleteRoom('w-in')
    const state = useCanvasStore.getState()
    expect(state.rooms.map((r) => r.id)).toEqual(['a', 'b', 'w-out'])
    expect(state.layoutMetadata.mvpConnections).toEqual([expect.objectContaining({ room_a: 'a', room_b: 'b', kind: 'open' })])
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.map((r) => r.id)).toContain('w-in')
    expect(useCanvasStore.getState().layoutMetadata.mvpConnections ?? []).toEqual([])
  })

  it('an outer wall stays and explains why', () => {
    useCanvasStore.getState().deleteRoom('w-out')
    const state = useCanvasStore.getState()
    expect(state.rooms.map((r) => r.id)).toContain('w-out')
    expect(state.clipboardMessage).toMatch(/building outline/)
  })

  it('cannot be moved, resized or rotated directly; user walls still can', () => {
    expect(capabilitiesOf(inner)).toMatchObject({ canMove: false, canResize: false, canRotate: false })
    const drawn = { ...inner, derived: undefined }
    expect(capabilitiesOf(drawn)).toMatchObject({ canMove: true, canResize: true, canRotate: true })
  })
})
