import { describe, expect, it } from 'vitest'

import {
  canvasObjectsToLayoutPlan,
  generateResponseToCanvas,
  layoutPlanToCanvas,
  replaceDerivedCanvasObjects,
} from './mvpLayoutAdapter'
import type {
  GenerateMvpResponse,
  LayoutPlan,
  RequirementsSpec,
  RoomType,
} from '../types/contracts'

const requirements: RequirementsSpec = {
  building_type: 'house',
  floors: 1,
  rooms: [{ type: 'bedroom', count: 2 }],
  adjacency: [],
  avoid_adjacency: [],
  plot: { width_m: 9, depth_m: 12 },
  facing: 'east',
  missing_info: [],
}

const layout: LayoutPlan = {
  plot: { width_m: 9, depth_m: 12, facing: 'east' },
  rooms: [
    {
      id: 'room-1',
      type: 'bedroom',
      label: 'Bedroom 1',
      x: 0,
      y: 0,
      w: 4.5,
      h: 12,
      rotation: 0,
      floor: 0,
    },
    {
      id: 'room-2',
      type: 'bedroom',
      label: 'Bedroom 2',
      x: 4.5,
      y: 0,
      w: 4.5,
      h: 12,
      rotation: 90,
      floor: 0,
    },
  ],
  walls: [
    { id: 'wall-1', x1: 4.5, y1: 0, x2: 4.5, y2: 12, thickness: 0.115, floor: 0 },
  ],
  doors: [
    { id: 'door-1', wall_ref: 'wall-1', offset: 2, width: 0.9, floor: 0 },
  ],
}

describe('canonical MVP layout adapter', () => {
  it('round-trips odd-millimetre widths without shifting shared edges', () => {
    const plan: LayoutPlan = {
      plot: { width_m: 12, depth_m: 15, facing: 'east' },
      rooms: [{ id: 'corridor', type: 'corridor', label: 'Corridor', x: 5.212, y: 0, w: 1.553, h: 15, rotation: 0, floor: 0 }],
      walls: [], doors: [],
    }
    const canvas = layoutPlanToCanvas(plan)
    const result = canvasObjectsToLayoutPlan(canvas.rooms, { x: 0, z: 0, w: 12, d: 15 }, 'east')
    expect(result.rooms).toEqual(plan.rooms)
  })
  it('converts NW room boxes into bounded canvas centers', () => {
    const result = layoutPlanToCanvas(layout, { requirements })
    const floor = result.floors?.[0]
    const rooms = result.rooms.filter((object) => object.objectType === 'room')

    expect(floor?.footprint).toEqual({ x: 0, z: 0, w: 9, d: 12 })
    expect(result.building?.footprint).toEqual(floor?.footprint)
    expect(rooms[0].position).toEqual({ x: 2.25, y: 1.5, z: 6 })
    expect(rooms[1].position).toEqual({ x: 6.75, y: 1.5, z: 6 })
    expect(rooms[1].rotation.y).toBe(90)
    expect(rooms[1].size).toEqual({ w: 12, h: 3, d: 4.5 })

    for (const room of rooms) {
      const swapsAxes = room.rotation.y === 90 || room.rotation.y === 270
      const worldWidth = swapsAxes ? room.size.d : room.size.w
      const worldDepth = swapsAxes ? room.size.w : room.size.d
      expect(room.position.x - worldWidth / 2).toBeGreaterThanOrEqual(0)
      expect(room.position.x + worldWidth / 2).toBeLessThanOrEqual(9)
      expect(room.position.z - worldDepth / 2).toBeGreaterThanOrEqual(0)
      expect(room.position.z + worldDepth / 2).toBeLessThanOrEqual(12)
    }
  })

  it('preserves wall and hosted-door identity for the editor', () => {
    const result = layoutPlanToCanvas(layout)
    const wall = result.rooms.find((object) => object.id === 'wall-1')
    const door = result.rooms.find((object) => object.id === 'door-1')

    expect(wall).toMatchObject({
      objectType: 'wall',
      position: { x: 4.5, y: 1.5, z: 6 },
      size: { w: 0.115, h: 3, d: 12 },
    })
    expect(door).toMatchObject({
      objectType: 'door',
      hostWallId: 'wall-1',
      position: { x: 4.5, y: 1.05, z: 2.45 },
    })
  })

  it('round-trips edited canvas geometry back to the canonical contract', () => {
    const canvas = layoutPlanToCanvas(layout)
    const restored = canvasObjectsToLayoutPlan(
      canvas.rooms,
      { x: 0, z: 0, w: 9, d: 12 },
      'east',
    )

    expect(restored).toEqual(layout)
  })

  it('keeps engine rooms outside the twelve residential types', () => {
    // The engine injects a `corridor` room. Dropping it here deleted it from
    // the plan sent for scoring, so every room it served came back
    // `unreachable` after any edit.
    const withCorridor: LayoutPlan = {
      ...layout,
      rooms: [
        ...layout.rooms,
        {
          id: 'corridor-1',
          type: 'corridor' as RoomType,
          label: 'Corridor',
          x: 0,
          y: 0,
          w: 1.2,
          h: 12,
          rotation: 0,
        },
      ],
    }
    const canvas = layoutPlanToCanvas(withCorridor)
    const restored = canvasObjectsToLayoutPlan(
      canvas.rooms,
      { x: 0, z: 0, w: 9, d: 12 },
      'east',
    )

    expect(restored.rooms.map((room) => room.id)).toContain('corridor-1')
  })

  it('serializes a rotated canvas room from its visible world bounds', () => {
    const source: LayoutPlan = {
      plot: layout.plot,
      rooms: [{
        id: 'turning-room',
        type: 'bedroom',
        label: 'Turning Room',
        x: 3,
        y: 3.5,
        w: 3,
        h: 5,
        rotation: 0,
      }],
      walls: [],
      doors: [],
    }
    const canvas = layoutPlanToCanvas(source)
    const room = canvas.rooms.find((object) => object.id === 'turning-room')!
    room.rotation.y = 90

    const rotated = canvasObjectsToLayoutPlan(
      canvas.rooms,
      { x: 0, z: 0, w: 9, d: 12 },
      'east',
    )

    expect(rotated.rooms[0]).toMatchObject({
      x: 2,
      y: 4.5,
      w: 5,
      h: 3,
      rotation: 90,
    })

    const reloaded = layoutPlanToCanvas(rotated).rooms.find(
      (object) => object.id === 'turning-room',
    )!
    expect(reloaded.position).toEqual(room.position)
    expect(reloaded.size).toEqual(room.size)
    expect(reloaded.rotation.y).toBe(90)
  })

  it('replaces only derived walls and doors during live synchronization', () => {
    const generated = layoutPlanToCanvas(layout).rooms
    const room = generated.find((object) => object.objectType === 'room')!
    const customWindow = {
      ...room,
      id: 'window-custom',
      label: 'Custom Window',
      objectType: 'window' as const,
      roomType: 'window',
    }
    const staleObjects = [
      room,
      customWindow,
      {
        ...generated.find((object) => object.objectType === 'wall')!,
        id: 'stale-wall',
      },
      {
        ...generated.find((object) => object.objectType === 'door')!,
        id: 'stale-door',
        hostWallId: 'stale-wall',
      },
    ]

    const result = replaceDerivedCanvasObjects(staleObjects, layout)

    expect(result.find((object) => object.id === room.id)).toBe(room)
    expect(result.find((object) => object.id === customWindow.id)).toBe(customWindow)
    expect(result.some((object) => object.id === 'stale-wall')).toBe(false)
    expect(result.some((object) => object.id === 'stale-door')).toBe(false)
    expect(result.some((object) => object.id === 'wall-1')).toBe(true)
    expect(result.find((object) => object.id === 'door-1')).toMatchObject({
      hostWallId: 'wall-1',
    })
  })

  it('preserves canonical floor levels through the existing canvas model', () => {
    const multi: LayoutPlan = {
      plot: layout.plot,
      rooms: [
        { ...layout.rooms[0], id: 'ground-room', floor: 0 },
        { ...layout.rooms[0], id: 'upper-room', floor: 1 },
        {
          id: 'upper-stair',
          type: 'staircase',
          label: 'Staircase 2',
          x: 0,
          y: 0,
          w: 1.2,
          h: 2.4,
          rotation: 0,
          floor: 1,
        },
      ],
      walls: [
        { ...layout.walls[0], id: 'upper-wall', floor: 1 },
      ],
      doors: [
        {
          ...layout.doors[0],
          id: 'upper-door',
          wall_ref: 'upper-wall',
          floor: 1,
        },
      ],
    }

    const canvas = layoutPlanToCanvas(multi)

    expect(canvas.metadata?.totalFloors).toBe(2)
    expect(canvas.floors?.map((floor) => floor.level)).toEqual([0, 1])
    expect(
      canvas.rooms.find((room) => room.id === 'upper-room')?.position.y,
    ).toBe(4.5)
    expect(
      canvas.rooms.find((room) => room.id === 'upper-stair')?.objectType,
    ).toBe('stair')

    const restored = canvasObjectsToLayoutPlan(
      canvas.rooms,
      { x: 0, z: 0, w: 9, d: 12 },
      'east',
    )
    expect(restored.rooms.find((room) => room.id === 'upper-room')?.floor).toBe(1)
    expect(restored.rooms.find((room) => room.id === 'upper-stair')?.floor).toBe(1)
    expect(restored.walls[0].floor).toBe(1)
    expect(restored.doors[0].floor).toBe(1)
  })

  it('preserves hierarchical zone identity and exposes archetype reasons', () => {
    const hierarchical: LayoutPlan = {
      ...layout,
      rooms: layout.rooms.map((room) => ({
        ...room,
        zone_id: room.id === 'room-1' ? 'zone-classrooms' : 'zone-support',
      })),
      archetype_reasons: [{
        zone_id: 'zone-classrooms',
        archetype: 'double_loaded_corridor',
        reason: 'repeat classrooms share a spine',
        room_ids: ['room-1'],
        spans: [{ x: 0, y: 0, w: 4.5, h: 12 }],
      }],
    }

    const canvas = layoutPlanToCanvas(hierarchical)
    const restored = canvasObjectsToLayoutPlan(
      canvas.rooms,
      { x: 0, z: 0, w: 9, d: 12 },
      'east',
    )

    expect(canvas.metadata?.archetypeReasons).toEqual(
      hierarchical.archetype_reasons,
    )
    expect(canvas.rooms.find((room) => room.id === 'room-1')?.zoneId).toBe(
      'zone-classrooms',
    )
    expect(restored.rooms.map((room) => room.zone_id)).toEqual([
      'zone-classrooms',
      'zone-support',
    ])
  })

  it('carries generation identity and produces deterministic canvas JSON', () => {
    const response: GenerateMvpResponse = {
      requirements,
      layout,
      quality: { valid: true, score: 92, hard_violations: [], warnings: [] },
      defaults_applied: ['plot', 'facing'],
      designId: 'design-1',
      designVersionId: 'version-1',
    }

    const first = generateResponseToCanvas(response, 'two bedroom house')
    const second = generateResponseToCanvas(response, 'two bedroom house')

    expect(first).toEqual(second)
    expect(first.designId).toBe('design-1')
    expect(first.designVersionId).toBe('version-1')
    expect(first.metadata).toMatchObject({
      pipeline: 'mvp',
      prompt: 'two bedroom house',
      mvpRequirements: requirements,
      mvpQuality: response.quality,
      mvpVastuEnabled: false,
    })
  })

  it('carries a polygon room’s vertices through to the canvas object (Phase 10.2)', () => {
    const polygonLayout: LayoutPlan = {
      plot: { width_m: 10, depth_m: 10, facing: 'east' },
      rooms: [
        {
          id: 'room-l',
          type: 'living_room',
          label: 'Living Room',
          x: 1,
          y: 1,
          w: 6,
          h: 6,
          rotation: 0,
          floor: 0,
          vertices: [
            { x: 1, y: 1 },
            { x: 7, y: 1 },
            { x: 7, y: 4 },
            { x: 4, y: 4 },
            { x: 4, y: 7 },
            { x: 1, y: 7 },
          ],
        },
      ],
      walls: [],
      doors: [],
    }

    const canvas = layoutPlanToCanvas(polygonLayout, { requirements })
    const room = canvas.rooms.find((object) => object.id === 'room-l')
    expect(room?.polygonVertices).toEqual([
      { x: 1, z: 1 },
      { x: 7, z: 1 },
      { x: 7, z: 4 },
      { x: 4, z: 4 },
      { x: 4, z: 7 },
      { x: 1, z: 7 },
    ])

    const roundTripped = canvasObjectsToLayoutPlan(
      canvas.rooms,
      { x: 0, z: 0, w: 10, d: 10 },
      'east',
    )
    const roundTrippedRoom = roundTripped.rooms.find((r) => r.id === 'room-l')
    expect(roundTrippedRoom).toMatchObject({
      x: 1, y: 1, w: 6, h: 6, rotation: 0,
      vertices: polygonLayout.rooms[0].vertices,
    })
  })
})
