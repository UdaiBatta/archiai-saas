import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from '../../store/canvasStore'
import { insertPolygonVertex, resizeRoomFromPlanHandle } from './plan2dGeometry'
import {
  cloneRoom,
  dimensionStrings,
  planEditPatch,
  planHandlePoints,
  polygonEdgeMidpoints,
  roomLabelLayout,
  roomPlanArea,
  roomWorldBounds,
} from './topViewModel'

const ROOM: Room = {
  id: 'room-1',
  label: 'Living Room',
  roomType: 'living_room',
  objectType: 'room',
  floorId: 'floor_0',
  floorLevel: 0,
  position: { x: 4, y: 1.5, z: 4 },
  size: { w: 4, h: 3, d: 4 },
  rotation: { x: 0, y: 0, z: 0 },
  color: '#b3b8e9',
}

const room = (overrides: Partial<Room> = {}): Room => ({
  ...cloneRoom(ROOM),
  ...overrides,
  size: { ...ROOM.size, ...overrides.size },
})

// ~31 px/m: a 10 m plan filling a 600 px viewport, as the old SVG plan did.
const PX = 31

describe('roomLabelLayout', () => {
  it('shows name and area in a comfortable room', () => {
    const layout = roomLabelLayout({ label: 'Living Room', w: 4, d: 4, pxPerMetre: PX, isSpace: true })
    expect(layout).toMatchObject({ nameFontPx: 12, showName: true, showArea: true })
  })

  it('drops the area line first in small rooms, keeping the name', () => {
    const layout = roomLabelLayout({ label: 'WC', w: 1.6, d: 1.6, pxPerMetre: PX, isSpace: true })
    expect(layout.showName).toBe(true)
    expect(layout.showArea).toBe(false)
  })

  it('hides all text in rooms too small for a readable label', () => {
    const layout = roomLabelLayout({ label: 'Storage Closet', w: 0.9, d: 0.9, pxPerMetre: PX, isSpace: true })
    expect(layout.showName).toBe(false)
    expect(layout.showArea).toBe(false)
  })

  it('shrinks long names before hiding them, and reveals them on zoom-in', () => {
    const far = roomLabelLayout({ label: 'Master Bedroom Suite', w: 3, d: 3, pxPerMetre: 20, isSpace: true })
    const near = roomLabelLayout({ label: 'Master Bedroom Suite', w: 3, d: 3, pxPerMetre: 80, isSpace: true })
    expect(far.showName).toBe(false)
    expect(near.showName).toBe(true)
    expect(roomLabelLayout({ label: 'Master Bedroom Suite', w: 3, d: 3, pxPerMetre: 40, isSpace: true }).nameFontPx).toBeLessThan(12)
  })

  it('never shows an area on non-space objects', () => {
    expect(roomLabelLayout({ label: 'Sofa', w: 4, d: 4, pxPerMetre: PX, isSpace: false }).showArea).toBe(false)
  })
})

describe('roomPlanArea', () => {
  it('uses the bounding box for rectangles and the shoelace area for polygons', () => {
    expect(roomPlanArea(ROOM)).toBe(16)
    const lShape = [
      { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 },
    ]
    expect(roomPlanArea({ size: ROOM.size, polygonVertices: lShape })).toBe(12)
  })
})

describe('dimensionStrings', () => {
  it('dimensions width along the north side and depth along the west side', () => {
    const [width, depth] = dimensionStrings({ x: 0, z: 0, w: 12, d: 9.5 }, 1)
    expect(width).toMatchObject({ start: { x: 0, z: -1 }, end: { x: 12, z: -1 }, text: '12.0 m', vertical: false })
    expect(width.label).toEqual({ x: 6, z: -1 })
    expect(depth).toMatchObject({ start: { x: -1, z: 0 }, end: { x: -1, z: 9.5 }, text: '9.5 m', vertical: true })
    // Ticks cross the line at both ends; extension lines stop short of the edge.
    expect(width.ticks).toEqual([
      [{ x: 0, z: -1.3 }, { x: 0, z: -0.7 }],
      [{ x: 12, z: -1.3 }, { x: 12, z: -0.7 }],
    ])
    expect(width.extensions[0][0]).toEqual({ x: 0, z: -0.25 })
  })

  it('measures a quarter-turned room on its world axes', () => {
    const turned = room({ rotation: { x: 0, y: 90, z: 0 }, size: { w: 6, h: 3, d: 2 } })
    expect(roomWorldBounds(turned)).toEqual({ x: 3, z: 1, w: 2, d: 6 })
    expect(dimensionStrings(roomWorldBounds(turned), 0.5).map((s) => s.text)).toEqual(['2.0 m', '6.0 m'])
  })
})

describe('planHandlePoints', () => {
  it('places eight handles on the corners and edge midpoints', () => {
    const points = planHandlePoints(ROOM)
    expect(points).toHaveLength(8)
    expect(points.find((p) => p.handle.key === 'se')).toMatchObject({ x: 6, z: 6, cursor: 'nwse-resize' })
    expect(points.find((p) => p.handle.key === 'n')).toMatchObject({ x: 4, z: 2, cursor: 'ns-resize' })
  })

  it('dragging any handle onto itself leaves every rotated room unchanged', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const turned = room({ rotation: { x: 0, y: rotation, z: 0 }, size: { w: 5, h: 3, d: 3 } })
      for (const point of planHandlePoints(turned)) {
        const next = resizeRoomFromPlanHandle({
          room: turned,
          handle: point.handle,
          point,
          snapToGrid: false,
          gridSize: 1,
        })
        expect(next.size.w).toBeCloseTo(5)
        expect(next.size.d).toBeCloseTo(3)
        expect(next.position.x).toBeCloseTo(4)
        expect(next.position.z).toBeCloseTo(4)
      }
    }
  })

  it('an outward drag grows the edge the handle sits on', () => {
    const turned = room({ rotation: { x: 0, y: 90, z: 0 }, size: { w: 6, h: 3, d: 2 } })
    const east = planHandlePoints(turned).find((p) => p.x > 4.9 && Math.abs(p.z - 4) < 0.01)!
    const next = resizeRoomFromPlanHandle({
      room: turned,
      handle: east.handle,
      point: { x: east.x + 1, z: east.z },
      snapToGrid: false,
      gridSize: 1,
    })
    expect(roomWorldBounds({ ...turned, ...next })).toEqual({ x: 3, z: 1, w: 3, d: 6 })
  })
})

describe('polygonEdgeMidpoints', () => {
  it('returns one midpoint per edge, wrapping to the first vertex', () => {
    expect(polygonEdgeMidpoints([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 2 }])).toEqual([
      { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 1 },
    ])
  })
})

describe('planEditPatch', () => {
  beforeEach(() => {
    useCanvasStore.getState().loadLayout({
      version: '1.0',
      floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, footprint: { x: 0, z: 0, w: 10, d: 10 }, rooms: [cloneRoom(ROOM)] }],
      rooms: [cloneRoom(ROOM)],
    })
    useCanvasStore.setState({ activityLog: [], past: [], future: [] })
  })

  it('writes nothing for a click that did not change the room', () => {
    expect(planEditPatch(ROOM, cloneRoom(ROOM))).toBeNull()
  })

  it('records one undoable resize from a live drag', () => {
    const store = useCanvasStore.getState()
    const start = cloneRoom(store.rooms[0])
    const snapshot = store.createHistorySnapshot()
    // Live drag frames are not logged...
    store.updateRoom(ROOM.id, { size: { ...ROOM.size, w: 5 }, position: { ...ROOM.position, x: 4.5 } }, { log: false })
    store.updateRoom(ROOM.id, { size: { ...ROOM.size, w: 6 }, position: { ...ROOM.position, x: 5 } }, { log: false })
    // ...the release commits once against the pre-drag snapshot.
    const patch = planEditPatch(start, useCanvasStore.getState().rooms[0])!
    expect(patch).toEqual({ position: { ...ROOM.position, x: 5 }, size: { ...ROOM.size, w: 6 } })
    store.updateRoom(ROOM.id, patch, { action: 'object.resized', previousValue: start, historySnapshot: snapshot })

    let state = useCanvasStore.getState()
    expect(state.activityLog.filter((entry) => entry.action === 'object.resized')).toHaveLength(1)
    expect(state.past).toHaveLength(1)
    state.undo()
    state = useCanvasStore.getState()
    expect(state.rooms[0].size).toEqual(ROOM.size)
    expect(state.rooms[0].position).toEqual(ROOM.position)
  })

  it('includes the vertices when a polygon edit changed them', () => {
    const polygon = room({
      polygonVertices: [{ x: 2, z: 2 }, { x: 6, z: 2 }, { x: 6, z: 6 }, { x: 2, z: 6 }],
    })
    const inserted = { ...polygon, ...insertPolygonVertex(polygon, 0)! }
    expect(planEditPatch(polygon, inserted)?.polygonVertices).toHaveLength(5)
  })
})
