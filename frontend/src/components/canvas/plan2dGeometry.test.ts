import { describe, expect, it } from 'vitest'
import type { Room } from '../../store/canvasStore'
import {
  clientPointToPlan,
  derivePlanBounds,
  PLAN_RESIZE_HANDLES,
  resizeRoomFromPlanHandle,
} from './plan2dGeometry'

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

describe('plan2d geometry', () => {
  it('derives padded bounds from the canonical floor footprint', () => {
    expect(derivePlanBounds({ x: 0, z: 0, w: 10, d: 8 }, [ROOM])).toEqual({
      x: -1.8,
      z: -1.62,
      w: 13.6,
      d: 12.59,
    })
  })

  it('maps screen points into the current plan viewBox', () => {
    expect(
      clientPointToPlan(
        300,
        150,
        { left: 0, top: 0, width: 600, height: 300 },
        { x: -1, z: -2, w: 12, d: 8 },
      ),
    ).toEqual({ x: 5, z: 2 })
  })

  it('accounts for centered letterboxing when the canvas aspect ratio differs', () => {
    const rect = { left: 0, top: 0, width: 600, height: 300 }
    const viewBox = { x: -1, z: -2, w: 12, d: 8 }

    expect(clientPointToPlan(75, 0, rect, viewBox)).toEqual({ x: -1, z: -2 })
    expect(clientPointToPlan(525, 300, rect, viewBox)).toEqual({ x: 11, z: 6 })
  })

  it('exposes all eight resize directions', () => {
    expect(PLAN_RESIZE_HANDLES.map((handle) => handle.key)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
    ])
  })

  it('snaps an anchored corner resize and keeps it inside the footprint', () => {
    const result = resizeRoomFromPlanHandle({
      room: ROOM,
      handle: PLAN_RESIZE_HANDLES.find((handle) => handle.key === 'se')!,
      point: { x: 100, z: 100 },
      snapToGrid: true,
      gridSize: 1,
      footprint: { x: 0, z: 0, w: 8, d: 8 },
    })

    expect(result.size).toEqual({ w: 6, h: 3, d: 6 })
    expect(result.position).toEqual({ x: 5, y: 1.5, z: 5 })
  })

  it('resizes the edge the user actually grabbed on a quarter-turned room', () => {
    // Local 4x6 turned 90 degrees renders as a 6x4 world box centred on (4, 4),
    // so the local "east" handle is drawn on the visible south edge (z = 6).
    const rotated: Room = {
      ...ROOM,
      size: { w: 4, h: 3, d: 6 },
      rotation: { x: 0, y: 90, z: 0 },
    }

    const result = resizeRoomFromPlanHandle({
      room: rotated,
      handle: PLAN_RESIZE_HANDLES.find((handle) => handle.key === 'e')!,
      point: { x: 4, z: 8 },
      snapToGrid: false,
      gridSize: 1,
    })

    // Dragging that edge to z = 8 grows the visible depth 4 -> 6 (local w),
    // keeps the visible width (local d) untouched, and anchors the north edge.
    expect(result.size).toEqual({ w: 6, h: 3, d: 6 })
    expect(result.position.x).toBe(4)
    expect(result.position.z).toBe(5)
  })

  it('anchors the opposite visible corner on a quarter-turned room', () => {
    const rotated: Room = {
      ...ROOM,
      size: { w: 4, h: 3, d: 6 },
      rotation: { x: 0, y: 90, z: 0 },
    }

    // The local "se" handle renders at the visible south-west corner (1, 6),
    // so its anchor is the north-east corner (7, 2).
    const result = resizeRoomFromPlanHandle({
      room: rotated,
      handle: PLAN_RESIZE_HANDLES.find((handle) => handle.key === 'se')!,
      point: { x: 0, z: 8 },
      snapToGrid: false,
      gridSize: 1,
    })

    expect(result.size).toEqual({ w: 6, h: 3, d: 7 })
    expect(result.position.x).toBe(3.5)
    expect(result.position.z).toBe(5)
  })

  it('clamps a quarter-turned resize against the matching world footprint axis', () => {
    const rotated: Room = {
      ...ROOM,
      size: { w: 4, h: 3, d: 6 },
      rotation: { x: 0, y: 90, z: 0 },
    }

    const result = resizeRoomFromPlanHandle({
      room: rotated,
      handle: PLAN_RESIZE_HANDLES.find((handle) => handle.key === 'e')!,
      point: { x: 4, z: 100 },
      snapToGrid: false,
      gridSize: 1,
      footprint: { x: 0, z: 0, w: 12, d: 8 },
    })

    // Anchored at z = 2, so the visible depth stops at the footprint edge.
    expect(result.size.w).toBe(6)
    expect(result.position.z).toBe(5)
  })

  it('changes only the axis controlled by an edge handle', () => {
    const result = resizeRoomFromPlanHandle({
      room: ROOM,
      handle: PLAN_RESIZE_HANDLES.find((handle) => handle.key === 'e')!,
      point: { x: 7.2, z: 99 },
      snapToGrid: false,
      gridSize: 1,
    })

    expect(result.size.w).toBeCloseTo(5.2)
    expect(result.size.d).toBe(4)
    expect(result.position.x).toBeCloseTo(4.6)
    expect(result.position.z).toBe(4)
  })
})
