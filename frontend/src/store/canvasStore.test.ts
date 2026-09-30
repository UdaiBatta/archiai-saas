import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_FLOOR, DEFAULT_FLOOR_HEIGHT, useCanvasStore, INITIAL_ROOMS, Room } from './canvasStore'
import { COMPONENT_DEFINITIONS, COMPONENT_REGISTRY, type CanvasObjectType } from './componentRegistry'

beforeEach(() => {
  useCanvasStore.setState({
    rooms: INITIAL_ROOMS.map((r) => ({
      ...r,
      floorId: DEFAULT_FLOOR.id,
      floorLevel: DEFAULT_FLOOR.level,
      position: { ...r.position },
      size: { ...r.size },
      rotation: { ...r.rotation },
    })),
    floors: [DEFAULT_FLOOR],
    selectedFloor: 0,
    viewMode: '3d',
    floorHeight: DEFAULT_FLOOR_HEIGHT,
    designId: null,
    designVersionId: null,
    layoutMetadata: {},
    generationInsights: null,
    selectedId: null,
    snapToGrid: false,
    gridSize: 1,
    showDimensions: false,
    interactionMode: 'select',
    pointerIntent: 'idle',
    saveStatus: 'saved',
    lastSavedAt: null,
    hasUnsavedChanges: false,
    lastDraftSavedAt: null,
    draftStatus: 'idle',
    draftError: null,
    recoveredDraftAvailable: false,
    latestDraftVersionId: null,
    activityLog: [],
    past: [],
    future: [],
    clipboard: null,
    clipboardMessage: null,
    placementMode: null,
    measureMode: false,
    measurePoints: [],
  })
})

describe('draft state', () => {
  it('starts with a clean idle draft state', () => {
    const state = useCanvasStore.getState()

    expect(state.hasUnsavedChanges).toBe(false)
    expect(state.draftStatus).toBe('idle')
    expect(state.lastDraftSavedAt).toBeNull()
    expect(state.draftError).toBeNull()
    expect(state.latestDraftVersionId).toBeNull()
    expect(state.recoveredDraftAvailable).toBe(false)
  })

  it('marks draft state dirty without backend calls', () => {
    useCanvasStore.getState().markDirty()

    const state = useCanvasStore.getState()
    expect(state.hasUnsavedChanges).toBe(true)
    expect(state.draftStatus).toBe('dirty')
    expect(state.saveStatus).toBe('unsaved')
    expect(state.draftError).toBeNull()
  })

  it('tracks draft saving state', () => {
    useCanvasStore.getState().markDraftSaving()

    expect(useCanvasStore.getState().draftStatus).toBe('saving')
    expect(useCanvasStore.getState().draftError).toBeNull()
  })

  it('marks draft saved with timestamp and version id', () => {
    const timestamp = '2026-05-30T10:00:00.000Z'

    useCanvasStore.getState().markDirty()
    useCanvasStore.getState().markDraftSaved(timestamp, 'draft-version-1')

    const state = useCanvasStore.getState()
    expect(state.hasUnsavedChanges).toBe(false)
    expect(state.draftStatus).toBe('saved')
    expect(state.lastDraftSavedAt).toBe(timestamp)
    expect(state.latestDraftVersionId).toBe('draft-version-1')
    expect(state.draftError).toBeNull()
  })

  it('stores draft errors and keeps unsaved changes', () => {
    useCanvasStore.getState().markDraftError('Network unavailable')

    const state = useCanvasStore.getState()
    expect(state.hasUnsavedChanges).toBe(true)
    expect(state.draftStatus).toBe('error')
    expect(state.draftError).toBe('Network unavailable')
  })

  it('tracks recovered draft availability separately', () => {
    useCanvasStore.getState().setRecoveredDraftAvailable(true)

    expect(useCanvasStore.getState().recoveredDraftAvailable).toBe(true)
  })
})

describe('view mode', () => {
  it('starts in 3D mode and can switch to floor plan mode', () => {
    const store = useCanvasStore.getState()

    expect(store.viewMode).toBe('3d')
    store.setViewMode('floor_plan')

    expect(useCanvasStore.getState().viewMode).toBe('floor_plan')
  })
})

describe('selectRoom', () => {
  it('sets selectedId', () => {
    useCanvasStore.getState().selectRoom('room-1')
    expect(useCanvasStore.getState().selectedId).toBe('room-1')
  })

  it('overwrites a previous selection', () => {
    useCanvasStore.getState().selectRoom('room-1')
    useCanvasStore.getState().selectRoom('room-2')
    expect(useCanvasStore.getState().selectedId).toBe('room-2')
  })
})

describe('deselectAll', () => {
  it('clears selectedId', () => {
    useCanvasStore.getState().selectRoom('room-1')
    useCanvasStore.getState().deselectAll()
    expect(useCanvasStore.getState().selectedId).toBeNull()
  })
})

describe('updateRoom', () => {
  it('patches position of the target room', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      position: { x: 10, y: 1.5, z: 10 },
    })
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')
    expect(room?.position).toEqual({ x: 10, y: 1.5, z: 10 })
  })

  it('does not affect other rooms', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      position: { x: 10, y: 1.5, z: 10 },
    })
    const room2 = useCanvasStore.getState().rooms.find((r) => r.id === 'room-2')
    expect(room2?.position).toEqual({ x: 7, y: 1.5, z: 0 })
  })

  it('patches size independently of position', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      size: { w: 8, h: 3, d: 6 },
    })
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')
    expect(room?.size).toEqual({ w: 8, h: 3, d: 6 })
    expect(room?.position).toEqual({ x: 0, y: 1.5, z: 0 })
  })

  it('patches rotation', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      rotation: { x: 0, y: 45, z: 0 },
    })
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')
    expect(room?.rotation).toEqual({ x: 0, y: 45, z: 0 })
  })

  it('snaps X/Z position when grid snapping is enabled', () => {
    const store = useCanvasStore.getState()
    store.setSnapToGrid(true)
    store.updateRoom('room-1', {
      position: { x: 2.4, y: 1.5, z: 3.6 },
    })

    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')
    expect(room?.position).toEqual({ x: 2, y: 1.5, z: 4 })
  })

  it('toggles showDimensions', () => {
    expect(useCanvasStore.getState().showDimensions).toBe(false)
    useCanvasStore.getState().setShowDimensions(true)
    expect(useCanvasStore.getState().showDimensions).toBe(true)
  })

  it('logs edit activity with old and new values', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      position: { x: 3, y: 1.5, z: 4 },
    })

    const [entry] = useCanvasStore.getState().activityLog
    expect(entry.action).toBe('object.moved')
    expect(entry.objectId).toBe('room-1')
    expect(entry.previousValue).toMatchObject({ position: { x: 0, y: 1.5, z: 0 } })
    expect(entry.newValue).toMatchObject({ position: { x: 3, y: 1.5, z: 4 } })
  })

  it('marks the layout as unsaved after an edit', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      position: { x: 3, y: 1.5, z: 4 },
    })

    expect(useCanvasStore.getState().saveStatus).toBe('unsaved')
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
    expect(useCanvasStore.getState().draftStatus).toBe('dirty')
  })
})

describe('deleteRoom', () => {
  it('removes the room with the given id', () => {
    useCanvasStore.getState().deleteRoom('room-1')
    expect(useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')).toBeUndefined()
  })

  it('does not remove other rooms', () => {
    useCanvasStore.getState().deleteRoom('room-1')
    expect(useCanvasStore.getState().rooms).toHaveLength(4)
  })

  it('logs deletion and clears the selection', () => {
    const store = useCanvasStore.getState()
    store.selectRoom('room-1')
    store.deleteRoom('room-1')

    const state = useCanvasStore.getState()
    expect(state.selectedId).toBeNull()
    expect(state.activityLog[0].action).toBe('object.deleted')
  })
})

describe('duplicateRoom', () => {
  it('duplicates a room and selects the copy', () => {
    useCanvasStore.getState().duplicateRoom('room-1')

    const state = useCanvasStore.getState()
    const copy = state.rooms.find((r) => r.label === 'Living Room Copy')
    expect(copy).toBeDefined()
    expect(state.selectedId).toBe(copy?.id)
    expect(state.activityLog[0].action).toBe('object.duplicated')
  })

  it('preserves floor assignment on duplicate', () => {
    useCanvasStore.getState().updateRoom('room-1', {
      floorId: 'floor_1',
      floorLevel: 1,
      position: { x: 0, y: 4.7, z: 0 },
    })
    useCanvasStore.getState().duplicateRoom('room-1')

    const copy = useCanvasStore.getState().rooms.find((r) => r.label === 'Living Room Copy')
    expect(copy?.floorId).toBe('floor_1')
    expect(copy?.floorLevel).toBe(1)
    expect(copy?.position.y).toBe(4.7)
  })
})

describe('addObject', () => {
  it('adds a new object with defaults and selects it', () => {
    useCanvasStore.getState().addObject('wall')

    const state = useCanvasStore.getState()
    const wall = state.rooms.find((r) => r.objectType === 'wall')
    expect(wall).toMatchObject({
      label: 'Wall',
      size: { w: 6, h: 2.8, d: 0.25 },
    })
    expect(state.selectedId).toBe(wall?.id)
    expect(state.activityLog[0].action).toBe('object.added')
  })

  it('adds new objects on the selected floor', () => {
    const store = useCanvasStore.getState()
    store.loadLayout({
      version: '1.0',
      metadata: { prompt: '2 floor house', building_type: 'house', room_count: 0 },
      building: { floorHeight: 3.2 },
      rooms: [],
      floors: [
        { id: 'floor_0', name: 'Ground Floor', level: 0, elevation: 0, rooms: [] },
        { id: 'floor_1', name: 'First Floor', level: 1, elevation: 3.2, rooms: [] },
      ],
    })
    store.setSelectedFloor(1)
    store.addObject('room')

    const room = useCanvasStore.getState().rooms[0]
    expect(room.floorId).toBe('floor_1')
    expect(room.floorLevel).toBe(1)
    expect(room.position.y).toBe(4.7)
  })
})

describe('floor actions', () => {
  it('addFloorAbove pushes a new floor above the current top and selects it', () => {
    const store = useCanvasStore.getState()
    store.addFloorAbove()

    const state = useCanvasStore.getState()
    expect(state.floors.map((f) => f.level)).toEqual([0, 1])
    expect(state.selectedFloor).toBe(1)
    expect(state.floors[1].elevation).toBe(DEFAULT_FLOOR_HEIGHT)
    expect(state.selectedId).toBeNull()
  })

  it('addFloorBelow pushes a new floor below the current bottom and selects it', () => {
    const store = useCanvasStore.getState()
    store.addFloorBelow()

    const state = useCanvasStore.getState()
    expect(state.floors.map((f) => f.level)).toEqual([0, -1])
    expect(state.selectedFloor).toBe(-1)
    expect(state.floors[1].elevation).toBe(-DEFAULT_FLOOR_HEIGHT)
  })

  it('removeFloor deletes the floor and its rooms, falling back to another floor', () => {
    const store = useCanvasStore.getState()
    store.addFloorAbove()
    store.setSelectedFloor(1)
    store.addObject('room')

    store.removeFloor(1)

    const state = useCanvasStore.getState()
    expect(state.floors.map((f) => f.level)).toEqual([0])
    expect(state.rooms.some((r) => r.floorLevel === 1)).toBe(false)
    expect(state.selectedFloor).toBe(0)
  })

  it('removeFloor is a no-op when only one floor remains', () => {
    const store = useCanvasStore.getState()
    store.removeFloor(0)

    const state = useCanvasStore.getState()
    expect(state.floors).toHaveLength(1)
  })
})

describe('loadRooms', () => {
  it('replaces all rooms and clears selectedId', () => {
    const store = useCanvasStore.getState()
    store.selectRoom('room-1')
    expect(useCanvasStore.getState().selectedId).toBe('room-1')

    const newRooms: Room[] = [
      {
        id: 'gen-1',
        label: 'Living Room',
        objectType: 'room',
        position: { x: 2.5, y: 1.5, z: 2.5 },
        size: { w: 5, h: 3, d: 5 },
        rotation: { x: 0, y: 0, z: 0 },
        color: '#818cf8',
      },
    ]
    store.loadRooms(newRooms)

    const state = useCanvasStore.getState()
    expect(state.rooms[0]).toMatchObject({
      ...newRooms[0],
      floorId: 'floor_0',
      floorLevel: 0,
    })
    expect(state.selectedId).toBeNull()
  })
})

describe('loadLayout and serializeLayout', () => {
  it('clears the layout for empty projects', () => {
    const store = useCanvasStore.getState()
    store.markDirty()
    store.clearLayout()

    const state = useCanvasStore.getState()
    expect(state.rooms).toHaveLength(0)
    expect(state.designId).toBeNull()
    expect(state.saveStatus).toBe('saved')
    expect(state.hasUnsavedChanges).toBe(false)
    expect(state.draftStatus).toBe('idle')
  })

  it('loads multi-floor layouts and defaults to the ground floor', () => {
    const store = useCanvasStore.getState()
    store.markDraftError('Previous draft failed')
    store.loadLayout({
      version: '1.0',
      designId: 'design-1',
      designVersionId: 'version-1',
      metadata: { prompt: '2 floor house', building_type: 'house', room_count: 2 },
      building: { floorHeight: 3.2 },
      rooms: [],
      floors: [
        {
          id: 'floor_0',
          name: 'Ground Floor',
          level: 0,
          elevation: 0,
          footprint: { x: -1, z: -1, w: 8, d: 8 },
          rooms: [
            {
              id: 'ground-room',
              label: 'Living Room',
              objectType: 'room',
              position: { x: 0, y: 1.5, z: 0 },
              size: { w: 4, h: 3, d: 4 },
              rotation: { x: 0, y: 0, z: 0 },
              color: '#818cf8',
            },
          ],
        },
        {
          id: 'floor_1',
          name: 'First Floor',
          level: 1,
          elevation: 3.2,
          rooms: [
            {
              id: 'upper-room',
              label: 'Bedroom',
              objectType: 'room',
              position: { x: 0, y: 4.7, z: 0 },
              size: { w: 4, h: 3, d: 4 },
              rotation: { x: 0, y: 0, z: 0 },
              color: '#f472b6',
            },
          ],
        },
      ],
    })

    const state = useCanvasStore.getState()
    expect(state.designId).toBe('design-1')
    expect(state.floors).toHaveLength(2)
    expect(state.floors[0].footprint).toEqual({ x: -1, z: -1, w: 8, d: 8 })
    expect(state.rooms).toHaveLength(2)
    expect(state.selectedFloor).toBe(0)
    expect(state.rooms.find((room) => room.id === 'upper-room')?.floorLevel).toBe(1)
    expect(state.hasUnsavedChanges).toBe(false)
    expect(state.draftStatus).toBe('idle')
    expect(state.draftError).toBeNull()
  })

  it('serializes rooms back into floor buckets', () => {
    const store = useCanvasStore.getState()
    store.loadLayout({
      version: '1.0',
      metadata: { prompt: '2 floor house', building_type: 'house', room_count: 2 },
      building: { floorHeight: 3.2 },
      rooms: [],
      floors: [
        { id: 'floor_0', name: 'Ground Floor', level: 0, elevation: 0, rooms: [] },
        { id: 'floor_1', name: 'First Floor', level: 1, elevation: 3.2, rooms: [] },
      ],
    })
    store.setSelectedFloor(1)
    store.addObject('room')

    const layout = useCanvasStore.getState().serializeLayout()
    expect(layout.floors).toHaveLength(2)
    expect(layout.floors?.[1].rooms).toHaveLength(1)
    expect(layout.metadata?.totalFloors).toBe(2)
    expect(layout.metadata?.totalRooms).toBe(1)
    expect(layout.metadata?.totalObjects).toBe(1)
  })

  it('preserves generation insights when loading and serializing a layout', () => {
    const insights = {
      score: 92,
      reasons: ['Public rooms form a useful cluster'],
      warnings: [],
      appliedRules: ['apartment template', 'pattern sizing'],
    }

    useCanvasStore.getState().loadLayout({
      version: '1.0',
      metadata: { buildingType: 'apartment' },
      rooms: [],
      insights,
    })

    expect(useCanvasStore.getState().generationInsights).toEqual(insights)
    expect(useCanvasStore.getState().serializeLayout().insights).toEqual(insights)
  })
})

// Phase 1 - direct manipulation

function loadFootprintFloor() {
  // Ground floor with an 8x8 footprint anchored at (0,0).
  useCanvasStore.getState().loadLayout({
    version: '1.0',
    building: { floorHeight: 3.2 },
    rooms: [],
    floors: [
      {
        id: 'floor_0',
        name: 'Ground Floor',
        level: 0,
        elevation: 0,
        footprint: { x: 0, z: 0, w: 8, d: 8 },
        rooms: [
          {
            id: 'r1',
            label: 'Room',
            objectType: 'room',
            position: { x: 4, y: 1.5, z: 4 },
            size: { w: 4, h: 3, d: 4 },
            rotation: { x: 0, y: 0, z: 0 },
            color: '#b3b8e9',
          },
        ],
      },
    ],
  })
}

// Objects may overhang the plot (balconies, canopies); they are only kept
// within the plot plus a 30 m working margin: here 8x8 -> [-30, 38].
describe('drag limits', () => {
  it('lets a room overhang the plot', () => {
    loadFootprintFloor()
    useCanvasStore.getState().updateRoom('r1', { position: { x: 9, y: 1.5, z: -1 } }, { log: false })
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'r1')!
    expect(room.position.x).toBe(9)
    expect(room.position.z).toBe(-1)
  })

  it('stops a room dragged far away at the working margin', () => {
    loadFootprintFloor()
    useCanvasStore.getState().updateRoom('r1', { position: { x: 100, y: 1.5, z: -100 } }, { log: false })

    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'r1')!
    // Room is 4 wide/deep -> centre within [-28, 36] on both axes.
    expect(room.position.x).toBe(36)
    expect(room.position.z).toBe(-28)
  })

  it('leaves an in-bounds position unchanged', () => {
    loadFootprintFloor()
    useCanvasStore.getState().updateRoom('r1', { position: { x: 5, y: 1.5, z: 3 } }, { log: false })
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'r1')!
    expect(room.position.x).toBe(5)
    expect(room.position.z).toBe(3)
  })

  it('limits a quarter-turned room by its visible footprint', () => {
    loadFootprintFloor()
    useCanvasStore.getState().updateRoom(
      'r1',
      {
        size: { w: 6, h: 3, d: 4 },
        rotation: { x: 0, y: 90, z: 0 },
        position: { x: 100, y: 1.5, z: 100 },
      },
      { log: false },
    )

    const room = useCanvasStore.getState().rooms.find((candidate) => candidate.id === 'r1')!
    // World size after the turn is 4 x 6.
    expect(room.position.x).toBe(36)
    expect(room.position.z).toBe(35)
  })

  it('lets a turn overhang the plot edge', () => {
    loadFootprintFloor()
    // 2 x 6 room parked against the right edge: after the turn it overhangs.
    useCanvasStore
      .getState()
      .updateRoom('r1', { size: { w: 2, h: 3, d: 6 }, position: { x: 7, y: 1.5, z: 4 } }, { log: false })
    expect(useCanvasStore.getState().rooms.find((r) => r.id === 'r1')!.position.x).toBe(7)

    useCanvasStore.getState().updateRoom('r1', { rotation: { x: 0, y: 90, z: 0 } })

    const room = useCanvasStore.getState().rooms.find((candidate) => candidate.id === 'r1')!
    expect(room.position.x).toBe(7)
    // Rotating must not move the object vertically.
    expect(room.position.y).toBe(1.5)
  })
})

describe('resizeRoom', () => {
  it('enforces the minimum dimension and writes exactly one resized log entry', () => {
    loadFootprintFloor()
    const before = useCanvasStore.getState().activityLog.length
    useCanvasStore.getState().resizeRoom('r1', { w: 0.01, h: 3, d: 0.01 })

    const state = useCanvasStore.getState()
    const room = state.rooms.find((r) => r.id === 'r1')!
    expect(room.size.w).toBe(COMPONENT_REGISTRY.room.minSize.w)
    expect(room.size.d).toBe(COMPONENT_REGISTRY.room.minSize.d)
    expect(state.activityLog.length).toBe(before + 1)
    expect(state.activityLog[0].action).toBe('object.resized')
  })

  it('recomputes elevation-aligned y from the new height', () => {
    loadFootprintFloor()
    useCanvasStore.getState().resizeRoom('r1', { w: 4, h: 5, d: 4 })
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'r1')!
    expect(room.position.y).toBe(2.5) // elevation 0 + height/2
  })

  it('lets a room grow past the plot', () => {
    loadFootprintFloor()
    useCanvasStore.getState().resizeRoom('r1', { w: 10, h: 3, d: 9 })

    const room = useCanvasStore.getState().rooms.find((candidate) => candidate.id === 'r1')!
    expect(room.size.w).toBe(10)
    expect(room.size.d).toBe(9)
    expect(room.position.x).toBe(4)
    expect(room.position.z).toBe(4)
  })

  it('keeps quarter-turned local dimensions as asked', () => {
    loadFootprintFloor()
    useCanvasStore.getState().updateRoom(
      'r1',
      { rotation: { x: 0, y: 90, z: 0 } },
      { log: false },
    )
    useCanvasStore.getState().resizeRoom('r1', { w: 10, h: 3, d: 9 })

    const room = useCanvasStore.getState().rooms.find((candidate) => candidate.id === 'r1')!
    expect(room.size.w).toBe(10)
    expect(room.size.d).toBe(9)
    expect(room.position.x).toBe(4)
    expect(room.position.z).toBe(4)
  })
})

describe('new object types', () => {
  it('adds each new object type with its defaults', () => {
    for (const type of ['corridor', 'lift', 'shaft', 'furniture', 'column', 'generic'] as const) {
      useCanvasStore.getState().addObject(type)
      const obj = useCanvasStore.getState().rooms.find((r) => r.objectType === type)
      expect(obj, `expected a ${type} object`).toBeDefined()
    }
  })

  it('round-trips new object types through serialize/deserialize', () => {
    useCanvasStore.getState().clearLayout()
    useCanvasStore.getState().addObject('corridor')
    useCanvasStore.getState().addObject('lift')

    const serialized = useCanvasStore.getState().serializeLayout()
    useCanvasStore.getState().loadLayout(serialized)

    const types = useCanvasStore.getState().rooms.map((r) => r.objectType).sort()
    expect(types).toEqual(['corridor', 'lift'])
  })

  it('normalizes an unknown object type gracefully to generic', () => {
    useCanvasStore.getState().loadRooms([
      {
        id: 'weird',
        label: 'Weird',
        // @ts-expect-error deliberately unknown type from an old/foreign payload
        objectType: 'teleporter',
        position: { x: 0, y: 1.5, z: 0 },
        size: { w: 3, h: 3, d: 3 },
        rotation: { x: 0, y: 0, z: 0 },
        color: '#ccc',
      },
    ])
    expect(useCanvasStore.getState().rooms[0].objectType).toBe('generic')
  })
})

describe('click-to-place', () => {
  it('places an object at the given coordinates and clears placement mode', () => {
    loadFootprintFloor()
    useCanvasStore.getState().setPlacementMode('furniture')
    useCanvasStore.getState().addObjectAt('furniture', 5, 3)

    const state = useCanvasStore.getState()
    const obj = state.rooms.find((r) => r.objectType === 'furniture')!
    expect(obj.position.x).toBe(5)
    expect(obj.position.z).toBe(3)
    expect(state.placementMode).toBeNull()
  })
})

describe('undo/redo', () => {
  it('reverts an add', () => {
    const start = useCanvasStore.getState().rooms.length
    useCanvasStore.getState().addObject('wall')
    expect(useCanvasStore.getState().rooms.length).toBe(start + 1)

    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.length).toBe(start)
  })

  it('replaceLayout swaps the plan as one undoable edit', () => {
    useCanvasStore.setState({ designId: 'd1', layoutMetadata: { savedViews: [{ id: 'v1' }], prompt: 'old' } })
    const before = useCanvasStore.getState().rooms.map((r) => r.id)
    useCanvasStore.getState().replaceLayout({
      version: '1.0',
      metadata: { prompt: 'new' },
      rooms: [{
        id: 'opt-1', label: 'Hall', objectType: 'room',
        position: { x: 1, y: 1.5, z: 1 }, size: { w: 2, h: 3, d: 2 }, rotation: { x: 0, y: 0, z: 0 }, color: '#5F6E88',
      }],
    })
    let state = useCanvasStore.getState()
    expect(state.rooms.map((r) => r.id)).toEqual(['opt-1'])
    expect(state.designId).toBe('d1')
    expect(state.layoutMetadata).toEqual({ prompt: 'new', savedViews: [{ id: 'v1' }] })
    expect(state.past).toHaveLength(1)
    expect(state.hasUnsavedChanges).toBe(true)

    state.undo()
    state = useCanvasStore.getState()
    expect(state.rooms.map((r) => r.id)).toEqual(before)
    expect(state.layoutMetadata.prompt).toBe('old')
    state.redo()
    expect(useCanvasStore.getState().rooms.map((r) => r.id)).toEqual(['opt-1'])
  })

  it('keeps saved camera views across undo and redo, and saves them with the layout', () => {
    useCanvasStore.getState().updateRoom('room-1', { position: { x: 3, y: 1.5, z: 4 } })
    useCanvasStore.getState().setSavedViews([{ id: 'v1' }])
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().layoutMetadata.savedViews).toEqual([{ id: 'v1' }])
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().layoutMetadata.savedViews).toEqual([{ id: 'v1' }])
    expect(useCanvasStore.getState().serializeLayout().metadata?.savedViews).toEqual([{ id: 'v1' }])
  })

  it('saves the site and masses with the layout, and undoes them', () => {
    const site = {
      boundary: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 30 }],
      rules: { setbacks: [3, 1.5, 1.5], maxHeightM: 12, maxCoverage: 0.5, maxFar: 1.8 },
    }
    const mass = { id: 'm1', name: 'Block A', footprint: site.boundary, floors: 3, floorHeightM: 3.2, baseM: 0 }
    useCanvasStore.getState().setSite(site)
    useCanvasStore.getState().setMasses([mass])
    expect(useCanvasStore.getState().serializeLayout().metadata?.site).toEqual(site)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().layoutMetadata.masses).toBeUndefined()
    expect(useCanvasStore.getState().layoutMetadata.site).toEqual(site)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().layoutMetadata.site).toBeUndefined()
    useCanvasStore.getState().redo()
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().layoutMetadata.masses).toEqual([mass])
  })

  it('reverts a move', () => {
    useCanvasStore.getState().updateRoom('room-1', { position: { x: 3, y: 1.5, z: 4 } })
    useCanvasStore.getState().undo()
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')!
    expect(room.position).toEqual({ x: 0, y: 1.5, z: 0 })
  })

  it('reverts a resize', () => {
    loadFootprintFloor()
    useCanvasStore.getState().resizeRoom('r1', { w: 7, h: 3, d: 7 })
    useCanvasStore.getState().undo()
    const room = useCanvasStore.getState().rooms.find((r) => r.id === 'r1')!
    expect(room.size).toEqual({ w: 4, h: 3, d: 4 })
  })

  it('reverts a delete', () => {
    useCanvasStore.getState().deleteRoom('room-1')
    expect(useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')).toBeUndefined()
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.find((r) => r.id === 'room-1')).toBeDefined()
  })

  it('redo re-applies an undone change', () => {
    const start = useCanvasStore.getState().rooms.length
    useCanvasStore.getState().addObject('wall')
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.length).toBe(start)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().rooms.length).toBe(start + 1)
  })

  it('restores matching validation metadata with undo and redo', () => {
    loadFootprintFloor()
    const validQuality = { valid: true, score: 88, hard_violations: [], warnings: [] }
    const invalidQuality = {
      valid: false,
      score: 42,
      hard_violations: [
        { code: 'overlap', room_ids: ['r1'], message: 'Room overlaps another space' },
      ],
      warnings: [],
    }
    useCanvasStore.setState({
      layoutMetadata: { pipeline: 'mvp', mvpQuality: validQuality },
    })

    useCanvasStore.getState().updateRoom('r1', {
      rotation: { x: 0, y: 90, z: 0 },
    })
    useCanvasStore.setState((state) => ({
      layoutMetadata: { ...state.layoutMetadata, mvpQuality: invalidQuality },
    }))

    useCanvasStore.getState().undo()
    let state = useCanvasStore.getState()
    expect(state.rooms.find((room) => room.id === 'r1')?.rotation.y).toBe(0)
    expect(state.layoutMetadata.mvpQuality).toEqual(validQuality)

    state.redo()
    state = useCanvasStore.getState()
    expect(state.rooms.find((room) => room.id === 'r1')?.rotation.y).toBe(90)
    expect(state.layoutMetadata.mvpQuality).toEqual(invalidQuality)
  })

  it('undo is a no-op with empty history', () => {
    const before = useCanvasStore.getState().rooms.length
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.length).toBe(before)
  })
})

describe('component registry lifecycle parity', () => {
  it.each(COMPONENT_DEFINITIONS.filter((definition) => definition.canCreate))(
    'creates, serializes, reloads, selects, copies, pastes, undoes, and redoes $type',
    (definition) => {
      const store = useCanvasStore.getState()
      store.clearLayout()
      store.addObject(definition.type)

      let state = useCanvasStore.getState()
      const created = state.rooms[0]
      expect(created.objectType).toBe(definition.type)
      expect(state.selectedId).toBe(created.id)
      expect(COMPONENT_REGISTRY[created.objectType].canMove).toBe(true)
      expect(typeof COMPONENT_REGISTRY[created.objectType].canResize).toBe('boolean')

      const serialized = state.serializeLayout()
      expect(serialized.rooms[0].objectType).toBe(definition.type)
      expect(serialized.floors?.[0].rooms?.[0].objectType).toBe(definition.type)

      store.loadLayout(serialized)
      state = useCanvasStore.getState()
      const reloaded = state.rooms[0]
      expect(reloaded.objectType).toBe(definition.type)

      state.selectRoom(reloaded.id)
      state.copySelected()
      state.pasteClipboard()

      state = useCanvasStore.getState()
      expect(state.rooms).toHaveLength(2)
      expect(state.rooms[1].objectType).toBe(definition.type)
      expect(state.rooms[1].id).not.toBe(reloaded.id)
      expect(state.selectedId).toBe(state.rooms[1].id)

      state.undo()
      expect(useCanvasStore.getState().rooms).toHaveLength(1)

      useCanvasStore.getState().redo()
      expect(useCanvasStore.getState().rooms).toHaveLength(2)
      expect(useCanvasStore.getState().rooms[1].objectType).toBe(definition.type)
    },
  )

  it('keeps floor as an explicitly editable legacy object type', () => {
    expect(COMPONENT_REGISTRY.floor.legacy).toBe(true)
    expect(COMPONENT_REGISTRY.floor.canCreate).toBe(true)
    expect(COMPONENT_REGISTRY.floor.canMove).toBe(true)
    expect(COMPONENT_REGISTRY.floor.canResize).toBe(true)
  })

  it('normalizes unknown foreign object types to generic without losing the object', () => {
    useCanvasStore.getState().loadLayout({
      version: '1.0',
      rooms: [
        {
          id: 'foreign-1',
          label: 'Imported Symbol',
          objectType: 'vendor_symbol' as CanvasObjectType,
          roomType: 'vendor_symbol',
          position: { x: 1, y: 1, z: 1 },
          size: { w: 1, h: 1, d: 1 },
          rotation: { x: 0, y: 0, z: 0 },
          color: '#999999',
        },
      ],
    })

    const [room] = useCanvasStore.getState().rooms
    expect(room.id).toBe('foreign-1')
    expect(room.objectType).toBe('generic')
    expect(room.roomType).toBe('vendor_symbol')
  })
})

describe('history, constraints, and clipboard operations', () => {
  it('undoes and redoes move, resize, delete, duplicate, and add actions', () => {
    const store = useCanvasStore.getState()

    store.updateRoom('room-1', { position: { x: 2, y: 1.5, z: 2 } })
    expect(useCanvasStore.getState().rooms.find((room) => room.id === 'room-1')?.position.x).toBe(2)
    store.undo()
    expect(useCanvasStore.getState().rooms.find((room) => room.id === 'room-1')?.position.x).toBe(0)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().rooms.find((room) => room.id === 'room-1')?.position.x).toBe(2)

    useCanvasStore.getState().updateRoom('room-1', { size: { w: 7, h: 3, d: 6 } })
    expect(useCanvasStore.getState().rooms.find((room) => room.id === 'room-1')?.size.w).toBe(7)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.find((room) => room.id === 'room-1')?.size.w).toBe(6)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().rooms.find((room) => room.id === 'room-1')?.size.w).toBe(7)

    useCanvasStore.getState().duplicateRoom('room-1')
    expect(useCanvasStore.getState().rooms).toHaveLength(6)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms).toHaveLength(5)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().rooms).toHaveLength(6)

    const duplicateId = useCanvasStore.getState().selectedId
    expect(duplicateId).toBeTruthy()
    useCanvasStore.getState().deleteRoom(duplicateId!)
    expect(useCanvasStore.getState().rooms).toHaveLength(5)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms).toHaveLength(6)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().rooms).toHaveLength(5)

    useCanvasStore.getState().addObject('column')
    expect(useCanvasStore.getState().rooms.some((room) => room.objectType === 'column')).toBe(true)
    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.some((room) => room.objectType === 'column')).toBe(false)
    useCanvasStore.getState().redo()
    expect(useCanvasStore.getState().rooms.some((room) => room.objectType === 'column')).toBe(true)
  })

  it('uses type-specific minimum dimensions for thin components', () => {
    const store = useCanvasStore.getState()
    store.clearLayout()
    store.addObject('wall')
    const wall = useCanvasStore.getState().rooms[0]

    useCanvasStore.getState().updateRoom(wall.id, { size: { w: 0, h: 0, d: 0 } })

    const resized = useCanvasStore.getState().rooms[0]
    expect(resized.size).toEqual(COMPONENT_REGISTRY.wall.minSize)
    expect(resized.size.d).toBeLessThan(1)
  })

  it('limits movement to the working area around the object floor', () => {
    const store = useCanvasStore.getState()
    store.loadLayout({
      version: '1.0',
      rooms: [],
      floors: [
        {
          id: 'floor_0',
          name: 'Ground Floor',
          level: 0,
          elevation: 0,
          footprint: { x: 0, z: 0, w: 4, d: 4 },
          rooms: [
            {
              id: 'small-room',
              label: 'Small Room',
              objectType: 'room',
              position: { x: 2, y: 1.5, z: 2 },
              size: { w: 2, h: 3, d: 2 },
              rotation: { x: 0, y: 0, z: 0 },
              color: '#b3b8e9',
            },
          ],
        },
      ],
    })

    store.updateRoom('small-room', { position: { x: 99, y: 1.5, z: -99 } })

    // 4 x 4 plot + 30 m margin -> centre of a 2 m room within [-29, 33].
    expect(useCanvasStore.getState().rooms[0].position).toEqual({ x: 33, y: 1.5, z: -29 })
  })

  it('pastes copied components onto the active floor with new ids and progressive offsets', () => {
    const store = useCanvasStore.getState()
    store.loadLayout({
      version: '1.0',
      rooms: [],
      floors: [
        { id: 'floor_0', name: 'Ground Floor', level: 0, elevation: 0, rooms: [] },
        { id: 'floor_1', name: 'First Floor', level: 1, elevation: 3.2, rooms: [] },
      ],
    })
    store.setSelectedFloor(0)
    store.addObject('room')
    const original = useCanvasStore.getState().rooms[0]
    useCanvasStore.getState().selectRoom(original.id)
    useCanvasStore.getState().copySelected()

    useCanvasStore.getState().setSelectedFloor(1)
    useCanvasStore.getState().pasteClipboard()
    useCanvasStore.getState().pasteClipboard()

    const state = useCanvasStore.getState()
    const pasted = state.rooms.slice(1)
    expect(pasted).toHaveLength(2)
    expect(pasted[0].id).not.toBe(original.id)
    expect(pasted[0].floorId).toBe('floor_1')
    expect(pasted[0].floorLevel).toBe(1)
    expect(pasted[0].position.y).toBe(4.7)
    expect(pasted[0].position.x).toBe(original.position.x + 1)
    expect(pasted[1].position.x).toBe(original.position.x + 2)
    expect(state.selectedId).toBe(pasted[1].id)
    expect(state.activityLog[0].action).toBe('object.pasted')
  })
})
