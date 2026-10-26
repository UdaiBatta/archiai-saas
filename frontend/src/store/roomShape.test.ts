import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from './canvasStore'

const room: Room = {
  id: 'r1', label: 'Living', objectType: 'room', roomType: 'living', floorLevel: 0,
  position: { x: 3, y: 1.5, z: 2 }, size: { w: 6, h: 3, d: 4 }, rotation: { x: 0, y: 0, z: 0 }, color: '#888888',
}
const footprint = { x: 0, z: 0, w: 10, d: 8 }

beforeEach(() => {
  useCanvasStore.setState({
    rooms: [room],
    floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, footprint }, { id: 'floor_1', name: 'First', level: 1, elevation: 3, footprint }],
    past: [], future: [],
  })
})
const current = () => useCanvasStore.getState().rooms[0]

describe('reshaping a room by its points', () => {
  it('turns a dragged-out midpoint into a polygon room, undoable', () => {
    const L = [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 3, z: 4 }, { x: 3, z: 6 }, { x: 0, z: 6 }]
    useCanvasStore.getState().setRoomOutline('r1', L, { commit: true })
    expect(current().polygonVertices).toEqual(L)
    expect(current().position).toMatchObject({ x: 3, z: 3 })
    expect(current().size).toMatchObject({ w: 6, h: 3, d: 6 })
    useCanvasStore.getState().undo()
    expect(current().polygonVertices).toBeUndefined()
  })

  it('goes back to a box room once the points make a rectangle again', () => {
    const store = useCanvasStore.getState()
    store.setRoomOutline('r1', [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 7, z: 4 }, { x: 0, z: 4 }], { commit: true })
    expect(current().polygonVertices).toHaveLength(4)
    // An extra point on a straight edge is dropped on commit.
    store.setRoomOutline('r1', [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }], { commit: true })
    expect(current().polygonVertices).toBeUndefined()
    expect(current().size).toMatchObject({ w: 6, d: 4 })
  })

  it('ignores a shape whose edges cross', () => {
    useCanvasStore.getState().setRoomOutline('r1', [{ x: 0, z: 0 }, { x: 6, z: 4 }, { x: 6, z: 0 }, { x: 0, z: 4 }])
    expect(current()).toEqual(room)
  })
})

describe('resizing the plot', () => {
  it('sets every floor to the new size, undoable', () => {
    useCanvasStore.getState().setPlotSize(14, 9)
    for (const floor of useCanvasStore.getState().floors) expect(floor.footprint).toEqual({ x: 0, z: 0, w: 14, d: 9 })
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().floors[0].footprint).toEqual(footprint)
  })

  it('never shrinks past the rooms on it', () => {
    useCanvasStore.getState().setPlotSize(2, 2)
    expect(useCanvasStore.getState().floors[0].footprint).toMatchObject({ w: 6, d: 4 })
  })
})

describe('floors share the plot', () => {
  it('gives a new floor above or below the plot of the others', () => {
    useCanvasStore.setState({ floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, footprint }] })
    useCanvasStore.getState().addFloorAbove()
    useCanvasStore.getState().addFloorBelow()
    for (const floor of useCanvasStore.getState().floors) expect(floor.footprint).toEqual(footprint)
  })

  it('repairs a saved floor that has no plot when the layout loads', () => {
    useCanvasStore.getState().loadLayout({
      version: '1.0',
      floors: [
        { id: 'floor_0', name: 'Ground', level: 0, elevation: 0, footprint, rooms: [room] },
        { id: 'floor_1', name: 'First', level: 1, elevation: 3, rooms: [] },
      ],
      rooms: [room],
    })
    expect(useCanvasStore.getState().floors.map((floor) => floor.footprint)).toEqual([footprint, footprint])
  })
})
