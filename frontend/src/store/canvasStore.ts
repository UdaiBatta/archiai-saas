import { create } from 'zustand'
import type { Mass, Site } from '../site/siteTypes'
import {
  COMPONENT_REGISTRY,
  clampComponentSize,
  componentTypeToRoomType,
  normalizeCanvasObjectType,
  type CanvasObjectType,
  type ComponentSize,
} from './componentRegistry'
import type { InteractionMode, PointerIntent } from './interactionModel'
import { quarterTurnPlanSize } from '../utils/quarterTurn'
import { snapDoorToWall, upsertConnection } from './connections'
import type { Connection, ConnectionKind } from '../types/contracts'

export type { CanvasObjectType } from './componentRegistry'
export type { InteractionMode, PointerIntent } from './interactionModel'

export type CanvasViewMode = '3d' | 'floor_plan' | 'zoning' | 'graph'

export type CanvasEditAction =
  | 'object.added'
  | 'object.deleted'
  | 'object.duplicated'
  | 'object.pasted'
  | 'object.moved'
  | 'object.resized'
  | 'object.rotated'
  | 'object.renamed'
  | 'object.updated'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'
export type DraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface Room {
  [key: string]: unknown
  id: string
  label: string
  roomType?: string
  objectType: CanvasObjectType
  floorId?: string
  floorLevel?: number
  zoneId?: string
  position: { x: number; y: number; z: number }
  size: ComponentSize
  rotation: { x: number; y: number; z: number }
  color: string
  /** Set only for a non-rectangular room (workflow Phase 8/10.2), in the
   * same world x/z coordinates as `position` - absolute, not relative to
   * center, since a polygon room's rotation is always 0 (no local-frame
   * transform to undo). `position`/`size` stay the vertices' bounding-box
   * center/extent, kept in sync by the move/resize helpers below, so every
   * existing consumer that only reads position/size keeps working. */
  polygonVertices?: { x: number; z: number }[]
}

export interface CanvasFloor {
  id: string
  name: string
  level: number
  elevation: number
  footprint?: { x: number; z: number; w: number; d: number }
  rooms?: Room[]
}

export interface GenerationInsights {
  score: number
  reasons: string[]
  warnings: string[]
  suggestions?: string[]
  appliedRules: string[]
}

export interface CanvasLayout {
  version: string
  designId?: string
  designVersionId?: string
  metadata?: Record<string, unknown>
  insights?: GenerationInsights
  building?: {
    floorHeight?: number
    footprint?: { x: number; z: number; w: number; d: number }
  }
  floors?: CanvasFloor[]
  rooms: Room[]
}

export interface CanvasActivityLogEntry {
  id: string
  action: CanvasEditAction
  objectId: string
  objectLabel: string
  previousValue: unknown
  newValue: unknown
  createdAt: string
}

export interface CanvasHistorySnapshot {
  rooms: Room[]
  floors: CanvasFloor[]
  layoutMetadata: Record<string, unknown>
  selectedId: string | null
  selectedFloor: number | 'all'
  floorHeight: number
}

interface CanvasClipboard {
  objects: Room[]
  copiedAt: string
  pasteCount: number
}

interface UpdateOptions {
  action?: CanvasEditAction
  log?: boolean
  previousValue?: unknown
  historySnapshot?: CanvasHistorySnapshot
}

interface CanvasState {
  rooms: Room[]
  floors: CanvasFloor[]
  selectedFloor: number | 'all'
  viewMode: CanvasViewMode
  floorHeight: number
  designId: string | null
  designVersionId: string | null
  layoutMetadata: Record<string, unknown>
  generationInsights: GenerationInsights | null
  selectedId: string | null
  snapToGrid: boolean
  gridSize: number
  showDimensions: boolean
  interactionMode: InteractionMode
  pointerIntent: PointerIntent
  saveStatus: SaveStatus
  lastSavedAt: string | null
  hasUnsavedChanges: boolean
  lastDraftSavedAt: string | null
  draftStatus: DraftStatus
  draftError: string | null
  recoveredDraftAvailable: boolean
  latestDraftVersionId: string | null
  activityLog: CanvasActivityLogEntry[]
  past: CanvasHistorySnapshot[]
  future: CanvasHistorySnapshot[]
  clipboard: CanvasClipboard | null
  clipboardMessage: string | null
  placementMode: CanvasObjectType | null
  measureMode: boolean
  measurePoints: { x: number; z: number }[]
  selectRoom: (id: string) => void
  deselectAll: () => void
  toggleMeasureMode: () => void
  addMeasurePoint: (x: number, z: number) => void
  clearMeasure: () => void
  setSelectedFloor: (floor: number | 'all') => void
  setViewMode: (mode: CanvasViewMode) => void
  setSnapToGrid: (enabled: boolean) => void
  setShowDimensions: (enabled: boolean) => void
  setInteractionMode: (mode: InteractionMode) => void
  setPointerIntent: (intent: PointerIntent) => void
  resetInteraction: () => void
  createHistorySnapshot: () => CanvasHistorySnapshot
  markDirty: () => void
  markDraftSaving: () => void
  markDraftSaved: (timestamp?: string, versionId?: string | null) => void
  markDraftError: (message: string) => void
  clearDraftState: () => void
  setLastSavedAt: (timestamp: string | null) => void
  setRecoveredDraftAvailable: (available: boolean) => void
  updateRoom: (id: string, patch: Partial<Omit<Room, 'id'>>, options?: UpdateOptions) => void
  /** Choose how two adjacent rooms meet: solid wall, door, or open. */
  setConnection: (roomA: string, roomB: string, kind: ConnectionKind) => void
  /** Named 3D camera views, saved with the layout (outside undo history). */
  setSavedViews: (views: unknown[]) => void
  /** Site boundary and zoning rules (P2), saved with the layout; undoable. */
  setSite: (site: Site | null) => void
  /** Building masses (P2), saved with the layout; undoable. */
  setMasses: (masses: Mass[]) => void
  resizeRoom: (
    id: string,
    size: ComponentSize,
    position?: { x: number; y: number; z: number },
  ) => void
  deleteRoom: (id: string) => void
  duplicateRoom: (id: string) => void
  duplicateSelected: () => void
  copySelected: () => void
  pasteClipboard: () => void
  clearClipboardMessage: () => void
  addObject: (objectType: CanvasObjectType) => void
  addObjectAt: (objectType: CanvasObjectType, x: number, z: number) => void
  setPlacementMode: (objectType: CanvasObjectType | null) => void
  undo: () => void
  redo: () => void
  addFloorAbove: () => void
  addFloorBelow: () => void
  removeFloor: (level: number) => void
  loadRooms: (rooms: Room[]) => void
  loadLayout: (layout: CanvasLayout) => void
  clearLayout: () => void
  serializeLayout: () => CanvasLayout
}

export const MIN_RESIZE_DIMENSION = 0.5
export const DEFAULT_FLOOR_HEIGHT = 3.2
export const DEFAULT_FLOOR: CanvasFloor = {
  id: 'floor_0',
  name: 'Ground Floor',
  level: 0,
  elevation: 0,
}

export const INITIAL_ROOMS: Room[] = [
  {
    id: 'room-1',
    label: 'Living Room',
    objectType: 'room',
    position: { x: 0, y: 1.5, z: 0 },
    size: { w: 6, h: 3, d: 5 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#5F6E88',
  },
  {
    id: 'room-2',
    label: 'Kitchen',
    objectType: 'room',
    position: { x: 7, y: 1.5, z: 0 },
    size: { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#84705B',
  },
  {
    id: 'room-3',
    label: 'Master Bedroom',
    objectType: 'room',
    position: { x: 0, y: 1.5, z: 6 },
    size: { w: 5, h: 3, d: 5 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#5E7876',
  },
  {
    id: 'room-4',
    label: 'Bedroom',
    objectType: 'room',
    position: { x: 6, y: 1.5, z: 6 },
    size: { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#6E7F68',
  },
  {
    id: 'room-5',
    label: 'Bathroom',
    objectType: 'room',
    position: { x: 11, y: 1.5, z: 6 },
    size: { w: 3, h: 3, d: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#4E5B72',
  },
]

const CLEAN_DRAFT_STATE = {
  hasUnsavedChanges: false,
  lastDraftSavedAt: null,
  draftStatus: 'idle' as DraftStatus,
  draftError: null,
  recoveredDraftAvailable: false,
  latestDraftVersionId: null,
}

const DIRTY_DRAFT_STATE = {
  hasUnsavedChanges: true,
  draftStatus: 'dirty' as DraftStatus,
  draftError: null,
}

const HISTORY_LIMIT = 100

let saveTimer: ReturnType<typeof setTimeout> | null = null
let idCounter = 0

function nextId(prefix: string) {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

function cloneRoom(room: Room): Room {
  return JSON.parse(JSON.stringify(room)) as Room
}

function cloneRooms(rooms: Room[]) {
  return rooms.map(cloneRoom)
}

function cloneFloors(floors: CanvasFloor[]) {
  return JSON.parse(JSON.stringify(floors)) as CanvasFloor[]
}

function snapshotOf(
  state: Pick<
    CanvasState,
    | 'rooms'
    | 'floors'
    | 'layoutMetadata'
    | 'selectedId'
    | 'selectedFloor'
    | 'floorHeight'
  >,
): CanvasHistorySnapshot {
  return {
    rooms: cloneRooms(state.rooms),
    floors: cloneFloors(state.floors),
    layoutMetadata: JSON.parse(JSON.stringify(state.layoutMetadata)) as Record<string, unknown>,
    selectedId: state.selectedId,
    selectedFloor: state.selectedFloor,
    floorHeight: state.floorHeight,
  }
}

/** Undo/redo restore the layout but keep the current saved camera views. */
function withSavedViewsOf(current: Record<string, unknown>, restored: Record<string, unknown>) {
  const metadata = JSON.parse(JSON.stringify(restored)) as Record<string, unknown>
  if (current.savedViews === undefined) delete metadata.savedViews
  else metadata.savedViews = current.savedViews
  return metadata
}

function connectionsOf(metadata: Record<string, unknown>): Connection[] {
  return Array.isArray(metadata.mvpConnections) ? (metadata.mvpConnections as Connection[]) : []
}

function pushHistory(state: CanvasState, snapshot?: CanvasHistorySnapshot) {
  return {
    past: [...state.past, snapshot ?? snapshotOf(state)].slice(-HISTORY_LIMIT),
    future: [] as CanvasHistorySnapshot[],
  }
}

function markUnsaved() {
  queueAutoSave()
  return {
    saveStatus: 'unsaved' as SaveStatus,
    ...DIRTY_DRAFT_STATE,
  }
}

function snapValue(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function floorName(level: number) {
  const names: Record<number, string> = {
    0: 'Ground Floor',
    1: 'First Floor',
    2: 'Second Floor',
    3: 'Third Floor',
  }
  return names[level] ?? `Floor ${level}`
}

function floorElevation(floors: CanvasFloor[], level: number | undefined) {
  return floors.find((floor) => floor.level === level)?.elevation ?? 0
}

function activeFloorForState(state: CanvasState) {
  const level = state.selectedFloor === 'all' ? 0 : state.selectedFloor
  return state.floors.find((floor) => floor.level === level) ?? state.floors[0] ?? DEFAULT_FLOOR
}

function normalizeObjectType(room: Partial<Room>): CanvasObjectType {
  const explicitType = normalizeCanvasObjectType(room.objectType)
  if (explicitType) return explicitType

  const inferredType = normalizeCanvasObjectType(room.roomType)
  if (!room.objectType && inferredType) return inferredType

  return room.objectType ? 'generic' : 'room'
}

/**
 * Where objects may go: the plot plus a wide margin. Balconies, canopies and
 * garden rooms often reach past the building or plot, so the plot itself is
 * not a limit; the margin only stops an object being dragged off to nowhere.
 */
export function workArea(footprint?: { x: number; z: number; w: number; d: number }) {
  if (!footprint || !(footprint.w > 0) || !(footprint.d > 0)) return footprint
  const margin = 30 // metres; keeps plan coordinates well inside the API's +-200 m
  return { x: footprint.x - margin, z: footprint.z - margin, w: footprint.w + 2 * margin, d: footprint.d + 2 * margin }
}

function clampToFootprint(
  position: { x: number; y: number; z: number },
  size: Pick<ComponentSize, 'w' | 'd'>,
  plot?: { x: number; z: number; w: number; d: number },
  rotationY = 0,
) {
  const footprint = workArea(plot)
  if (!footprint) return position
  const worldSize = quarterTurnPlanSize(size, rotationY)
  const clampAxis = (center: number, half: number, min: number, span: number) => {
    const lo = min + half
    const hi = min + span - half
    if (lo > hi) return min + span / 2
    return Math.min(hi, Math.max(lo, center))
  }
  return {
    ...position,
    x: clampAxis(position.x, worldSize.w / 2, footprint.x, footprint.w),
    z: clampAxis(position.z, worldSize.d / 2, footprint.z, footprint.d),
  }
}

function clampSizeToFootprint(
  size: ComponentSize,
  plot?: { x: number; z: number; w: number; d: number },
  rotationY = 0,
) {
  const footprint = workArea(plot)
  if (!footprint || footprint.w <= 0 || footprint.d <= 0) return size
  const worldSize = quarterTurnPlanSize(size, rotationY)
  const clampedWorldSize = {
    w: Math.min(worldSize.w, footprint.w),
    d: Math.min(worldSize.d, footprint.d),
  }
  const localSize = quarterTurnPlanSize(clampedWorldSize, rotationY)
  return {
    ...size,
    w: localSize.w,
    d: localSize.d,
  }
}

function footprintForLevel(floors: CanvasFloor[], level: number | undefined) {
  return floors.find((floor) => floor.level === level)?.footprint
}

function normalizeRoom(room: Partial<Room>, floor?: CanvasFloor): Room {
  const normalizedFloor = floor ?? DEFAULT_FLOOR
  const objectType = normalizeObjectType(room)
  const definition = COMPONENT_REGISTRY[objectType]
  const size = clampComponentSize(
    objectType,
    (room.size as ComponentSize | undefined) ?? definition.defaultSize,
    definition.defaultSize,
  )
  const positionSource = room.position ?? { x: 0, y: normalizedFloor.elevation + size.h / 2, z: 0 }
  const rotationSource = room.rotation ?? { x: 0, y: 0, z: 0 }

  return {
    ...room,
    id: typeof room.id === 'string' ? room.id : nextId(objectType),
    label: typeof room.label === 'string' && room.label.trim() ? room.label : definition.label,
    roomType: typeof room.roomType === 'string' ? room.roomType : componentTypeToRoomType(objectType),
    objectType,
    floorId: typeof room.floorId === 'string' ? room.floorId : normalizedFloor.id,
    floorLevel: typeof room.floorLevel === 'number' ? room.floorLevel : normalizedFloor.level,
    rotation: {
      x: finiteNumber(rotationSource.x, 0),
      y: finiteNumber(rotationSource.y, 0),
      z: finiteNumber(rotationSource.z, 0),
    },
    position: {
      x: finiteNumber(positionSource.x, 0),
      y: finiteNumber(positionSource.y, normalizedFloor.elevation + size.h / 2),
      z: finiteNumber(positionSource.z, 0),
    },
    size,
    color: typeof room.color === 'string' && room.color ? room.color : definition.defaultColor,
  }
}

function normalizeLayout(layout: CanvasLayout) {
  const floorHeight = layout.building?.floorHeight ?? DEFAULT_FLOOR_HEIGHT
  const sourceFloors = layout.floors?.length ? layout.floors : [DEFAULT_FLOOR]
  const floors = sourceFloors.map((floor) => ({
    id: floor.id,
    name: floor.name || floorName(floor.level),
    level: floor.level,
    elevation: floor.elevation ?? floor.level * floorHeight,
    footprint: floor.footprint,
  }))
  const rooms = layout.floors?.length
    ? layout.floors.flatMap((floor) =>
        (floor.rooms ?? []).map((room) =>
          normalizeRoom(room, {
            id: floor.id,
            name: floor.name,
            level: floor.level,
            elevation: floor.elevation,
            footprint: floor.footprint,
          })
        )
      )
    : layout.rooms.map((room) => normalizeRoom(room, floors[0]))

  return { floors, rooms, floorHeight }
}

function inferAction(patch: Partial<Omit<Room, 'id'>>): CanvasEditAction {
  if (patch.position) return 'object.moved'
  if (patch.size) return 'object.resized'
  if (patch.rotation) return 'object.rotated'
  if (patch.label) return 'object.renamed'
  return 'object.updated'
}

function applyGridToPosition(position: Room['position'], state: CanvasState) {
  if (!state.snapToGrid) return position
  return {
    ...position,
    x: snapValue(position.x, state.gridSize),
    z: snapValue(position.z, state.gridSize),
  }
}

function withFloorElevation(room: Room, floors: CanvasFloor[]) {
  const elevation = floorElevation(floors, room.floorLevel)
  return {
    ...room,
    position: {
      ...room.position,
      y: elevation + room.size.h / 2,
    },
  }
}

function offsetForPaste(state: CanvasState, pasteCount: number) {
  return Math.max(state.gridSize || 1, 1) * (pasteCount + 1)
}

function defaultRoomForType(objectType: CanvasObjectType, floor: CanvasFloor, x: number, z: number): Room {
  const definition = COMPONENT_REGISTRY[objectType]
  return {
    id: nextId(objectType),
    label: definition.label,
    roomType: componentTypeToRoomType(objectType),
    objectType,
    floorId: floor.id,
    floorLevel: floor.level,
    position: { x, y: floor.elevation + definition.defaultSize.h / 2, z },
    size: definition.defaultSize,
    rotation: { x: 0, y: 0, z: 0 },
    color: definition.defaultColor,
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  rooms: INITIAL_ROOMS.map((room) => normalizeRoom(room, DEFAULT_FLOOR)),
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
  ...CLEAN_DRAFT_STATE,
  activityLog: [],
  past: [],
  future: [],
  clipboard: null,
  clipboardMessage: null,
  placementMode: null,
  measureMode: false,
  measurePoints: [],
  selectRoom: (id) => set({ selectedId: id }),
  deselectAll: () => set({ selectedId: null }),
  toggleMeasureMode: () =>
    set((state) => ({
      measureMode: !state.measureMode,
      measurePoints: [],
      placementMode: null,
      interactionMode: !state.measureMode ? 'measure' : 'select',
      pointerIntent: 'idle',
    })),
  addMeasurePoint: (x, z) =>
    set((state) => {
      const base = state.measurePoints.length >= 2 ? [] : state.measurePoints
      return { measurePoints: [...base, { x, z }] }
    }),
  clearMeasure: () => set({ measurePoints: [] }),
  setSelectedFloor: (floor) =>
    set((state) => ({
      selectedFloor: floor,
      selectedId:
        floor === 'all' ||
        state.rooms.find((room) => room.id === state.selectedId)?.floorLevel === floor
          ? state.selectedId
          : null,
    })),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSnapToGrid: (enabled) => set({ snapToGrid: enabled }),
  setShowDimensions: (enabled) => set({ showDimensions: enabled }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  setPointerIntent: (intent) => set({ pointerIntent: intent }),
  resetInteraction: () => set({ interactionMode: 'select', pointerIntent: 'idle' }),
  createHistorySnapshot: () => snapshotOf(get()),
  markDirty: () =>
    set({
      ...DIRTY_DRAFT_STATE,
      saveStatus: 'unsaved',
    }),
  markDraftSaving: () =>
    set({
      draftStatus: 'saving',
      draftError: null,
    }),
  markDraftSaved: (timestamp = new Date().toISOString(), versionId) =>
    set((state) => ({
      hasUnsavedChanges: false,
      draftStatus: 'saved',
      lastDraftSavedAt: timestamp,
      draftError: null,
      latestDraftVersionId:
        versionId === undefined ? state.latestDraftVersionId : versionId,
    })),
  markDraftError: (message) =>
    set({
      hasUnsavedChanges: true,
      draftStatus: 'error',
      draftError: message,
    }),
  clearDraftState: () => set(CLEAN_DRAFT_STATE),
  setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),
  setRecoveredDraftAvailable: (available) =>
    set({ recoveredDraftAvailable: available }),
  updateRoom: (id, patch, options) =>
    set((state) => {
      const room = state.rooms.find((r) => r.id === id)
      if (!room) return state

      const nextPatch = { ...patch }
      const objectType = nextPatch.objectType
        ? normalizeCanvasObjectType(nextPatch.objectType) ?? 'generic'
        : room.objectType

      let updated: Room = {
        ...room,
        ...nextPatch,
        objectType,
        roomType:
          typeof nextPatch.roomType === 'string'
            ? nextPatch.roomType
            : nextPatch.objectType
              ? componentTypeToRoomType(objectType)
              : room.roomType,
      }

      const updatedFootprint = footprintForLevel(state.floors, updated.floorLevel)
      updated.size = clampSizeToFootprint(
        clampComponentSize(
          objectType,
          (nextPatch.size as ComponentSize | undefined) ?? room.size,
          room.size,
        ),
        updatedFootprint,
        objectType === 'room' ? updated.rotation.y : 0,
      )

      const patchPosition = nextPatch.position as Room['position'] | undefined
      if (patchPosition) {
        const nextPosition = applyGridToPosition(
          {
            x: finiteNumber(patchPosition.x, room.position.x),
            y: finiteNumber(patchPosition.y, room.position.y),
            z: finiteNumber(patchPosition.z, room.position.z),
          },
          state,
        )
        updated.position = clampToFootprint(
          nextPosition,
          updated.size,
          updatedFootprint,
          objectType === 'room' ? updated.rotation.y : 0,
        )
      } else if (nextPatch.size || nextPatch.floorLevel !== undefined || nextPatch.floorId !== undefined) {
        updated = withFloorElevation(updated, state.floors)
        updated.position = clampToFootprint(
          updated.position,
          updated.size,
          updatedFootprint,
          objectType === 'room' ? updated.rotation.y : 0,
        )
      } else if (nextPatch.rotation) {
        // A quarter turn swaps the visible world extents, so a room that fit
        // before the turn can overhang the footprint after it. Elevation is
        // deliberately left alone here — rotating must not move an object
        // vertically the way a resize or floor change does.
        updated.position = clampToFootprint(
          updated.position,
          updated.size,
          updatedFootprint,
          objectType === 'room' ? updated.rotation.y : 0,
        )
      }

      // A hosted door slides along its wall; between two rooms, where it
      // stops becomes the user's door connection for that pair.
      let layoutMetadata = state.layoutMetadata
      if (objectType === 'door' && typeof room.hostWallId === 'string' && patchPosition) {
        const wall = state.rooms.find((object) => object.id === room.hostWallId)
        if (wall) {
          const snapped = snapDoorToWall(updated, wall, patchPosition)
          updated.position = snapped.position
          const between = wall.betweenRooms
          if (Array.isArray(between) && between.length === 2) {
            layoutMetadata = {
              ...state.layoutMetadata,
              mvpConnections: upsertConnection(
                connectionsOf(state.layoutMetadata),
                String(between[0]),
                String(between[1]),
                'door',
                snapped.at,
              ),
            }
          }
        }
      }

      const shouldLog = options?.log ?? true
      const action = options?.action ?? inferAction(patch)
      const logEntry: CanvasActivityLogEntry | null = shouldLog
        ? {
            id: nextId('activity'),
            action,
            objectId: room.id,
            objectLabel: updated.label,
            previousValue: options?.previousValue ?? room,
            newValue: updated,
            createdAt: new Date().toISOString(),
          }
        : null

      return {
        rooms: state.rooms.map((r) => (r.id === id ? updated : r)),
        layoutMetadata,
        activityLog: logEntry ? [logEntry, ...state.activityLog] : state.activityLog,
        ...(shouldLog ? pushHistory(state, options?.historySnapshot) : {}),
        ...(shouldLog ? markUnsaved() : {}),
      }
    }),
  setSavedViews: (views) =>
    set((state) => ({
      layoutMetadata: { ...state.layoutMetadata, savedViews: views },
      ...markUnsaved(),
    })),
  setSite: (site) =>
    set((state) => {
      const layoutMetadata = { ...state.layoutMetadata }
      if (site) layoutMetadata.site = site
      else delete layoutMetadata.site
      return { layoutMetadata, ...pushHistory(state), ...markUnsaved() }
    }),
  setMasses: (masses) =>
    set((state) => ({
      layoutMetadata: { ...state.layoutMetadata, masses },
      ...pushHistory(state),
      ...markUnsaved(),
    })),
  setConnection: (roomA, roomB, kind) =>
    set((state) => {
      const labelOf = (id: string) => state.rooms.find((r) => r.id === id)?.label ?? id
      return {
        layoutMetadata: {
          ...state.layoutMetadata,
          mvpConnections: upsertConnection(connectionsOf(state.layoutMetadata), roomA, roomB, kind),
        },
        activityLog: [
          {
            id: nextId('activity'),
            action: 'object.updated' as CanvasEditAction,
            objectId: roomA,
            objectLabel: `${labelOf(roomA)} ↔ ${labelOf(roomB)}`,
            previousValue: null,
            newValue: kind,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ],
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  resizeRoom: (id, size, position) =>
    set((state) => {
      const room = state.rooms.find((r) => r.id === id)
      if (!room) return state

      const footprint = footprintForLevel(state.floors, room.floorLevel)
      const clampedSize = clampSizeToFootprint(
        clampComponentSize(room.objectType, size, room.size),
        footprint,
        room.objectType === 'room' ? room.rotation.y : 0,
      )
      let nextPosition = position ?? room.position
      nextPosition = applyGridToPosition(nextPosition, state)
      const elevation = floorElevation(state.floors, room.floorLevel)
      const clampedPosition = clampToFootprint(
        { ...nextPosition, y: elevation + clampedSize.h / 2 },
        clampedSize,
        footprint,
        room.objectType === 'room' ? room.rotation.y : 0,
      )
      const updated: Room = { ...room, size: clampedSize, position: clampedPosition }

      return {
        rooms: state.rooms.map((r) => (r.id === id ? updated : r)),
        activityLog: [
          {
            id: nextId('activity'),
            action: 'object.resized',
            objectId: room.id,
            objectLabel: updated.label,
            previousValue: room,
            newValue: updated,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ],
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  deleteRoom: (id) =>
    set((state) => {
      const room = state.rooms.find((r) => r.id === id)
      if (!room) return state
      return {
        rooms: state.rooms.filter((r) => r.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
        activityLog: [
          {
            id: nextId('activity'),
            action: 'object.deleted',
            objectId: room.id,
            objectLabel: room.label,
            previousValue: room,
            newValue: null,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ],
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  duplicateRoom: (id) =>
    set((state) => {
      const room = state.rooms.find((r) => r.id === id)
      if (!room) return state
      const offset = Math.max(state.gridSize || 1, 1)
      const copy: Room = {
        ...cloneRoom(room),
        id: nextId(room.objectType),
        label: `${room.label} Copy`,
        position: {
          ...room.position,
          x: room.position.x + offset,
          z: room.position.z + offset,
        },
      }
      copy.position = clampToFootprint(
        applyGridToPosition(copy.position, state),
        copy.size,
        footprintForLevel(state.floors, copy.floorLevel),
        copy.objectType === 'room' ? copy.rotation.y : 0,
      )
      return {
        rooms: [...state.rooms, copy],
        selectedId: copy.id,
        activityLog: [
          {
            id: nextId('activity'),
            action: 'object.duplicated',
            objectId: copy.id,
            objectLabel: copy.label,
            previousValue: room,
            newValue: copy,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ],
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  duplicateSelected: () => {
    const selectedId = get().selectedId
    if (selectedId) get().duplicateRoom(selectedId)
  },
  copySelected: () =>
    set((state) => {
      const room = state.rooms.find((candidate) => candidate.id === state.selectedId)
      if (!room) {
        return { clipboardMessage: 'Select a component to copy.' }
      }
      if (!COMPONENT_REGISTRY[room.objectType].canSelect) {
        return { clipboardMessage: `${room.label} cannot be copied.` }
      }
      return {
        clipboard: {
          objects: [cloneRoom(room)],
          copiedAt: new Date().toISOString(),
          pasteCount: 0,
        },
        clipboardMessage: `Copied ${room.label}.`,
      }
    }),
  pasteClipboard: () =>
    set((state) => {
      if (!state.clipboard || state.clipboard.objects.length === 0) {
        return { clipboardMessage: 'Copy a component before pasting.' }
      }

      const floor = activeFloorForState(state)
      const offset = offsetForPaste(state, state.clipboard.pasteCount)
      const pasted: Room[] = []

      for (const copied of state.clipboard.objects) {
        const objectType = normalizeCanvasObjectType(copied.objectType)
        if (!objectType || !COMPONENT_REGISTRY[objectType].canCreate) {
          return { clipboardMessage: 'Copied component is no longer supported.' }
        }
        const definition = COMPONENT_REGISTRY[objectType]
        const size = clampComponentSize(objectType, copied.size, definition.defaultSize)
        const pasteCandidate: Room = {
          ...cloneRoom(copied),
          id: nextId(objectType),
          label: copied.label.endsWith(' Copy') ? copied.label : `${copied.label} Copy`,
          objectType,
          roomType: copied.roomType ?? componentTypeToRoomType(objectType),
          floorId: floor.id,
          floorLevel: floor.level,
          size,
          position: {
            x: copied.position.x + offset,
            y: floor.elevation + size.h / 2,
            z: copied.position.z + offset,
          },
          rotation: copied.rotation ?? { x: 0, y: 0, z: 0 },
          color: copied.color ?? definition.defaultColor,
        }
        pasteCandidate.position = clampToFootprint(
          applyGridToPosition(pasteCandidate.position, state),
          pasteCandidate.size,
          floor.footprint,
          pasteCandidate.objectType === 'room' ? pasteCandidate.rotation.y : 0,
        )
        pasted.push(pasteCandidate)
      }

      const selectedId = pasted[pasted.length - 1]?.id ?? state.selectedId
      return {
        rooms: [...state.rooms, ...pasted],
        selectedId,
        clipboard: {
          ...state.clipboard,
          pasteCount: state.clipboard.pasteCount + 1,
        },
        clipboardMessage: `Pasted ${pasted.length === 1 ? pasted[0].label : `${pasted.length} components`}.`,
        activityLog: [
          {
            id: nextId('activity'),
            action: 'object.pasted',
            objectId: selectedId ?? 'paste',
            objectLabel: pasted[0]?.label ?? 'Pasted components',
            previousValue: null,
            newValue: pasted,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ],
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  clearClipboardMessage: () => set({ clipboardMessage: null }),
  addObject: (objectType) => get().addObjectAt(objectType, 0, 0),
  addObjectAt: (objectType, x, z) =>
    set((state) => {
      const floor = activeFloorForState(state)
      const newObject = defaultRoomForType(objectType, floor, x, z)
      newObject.position = clampToFootprint(
        newObject.position,
        newObject.size,
        floor.footprint,
        newObject.objectType === 'room' ? newObject.rotation.y : 0,
      )
      return {
        rooms: [...state.rooms, newObject],
        selectedId: newObject.id,
        placementMode: null,
        interactionMode: 'select',
        pointerIntent: 'idle',
        activityLog: [
          {
            id: nextId('activity'),
            action: 'object.added',
            objectId: newObject.id,
            objectLabel: newObject.label,
            previousValue: null,
            newValue: newObject,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ],
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  setPlacementMode: (objectType) =>
    set({
      placementMode: objectType,
      measureMode: false,
      measurePoints: [],
      interactionMode: objectType ? 'place' : 'select',
      pointerIntent: 'idle',
    }),
  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        rooms: cloneRooms(previous.rooms),
        floors: cloneFloors(previous.floors),
        layoutMetadata: withSavedViewsOf(state.layoutMetadata, previous.layoutMetadata),
        selectedId: previous.selectedId,
        selectedFloor: previous.selectedFloor,
        floorHeight: previous.floorHeight,
        past: state.past.slice(0, -1),
        future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
        pointerIntent: 'idle',
        ...markUnsaved(),
      }
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        rooms: cloneRooms(next.rooms),
        floors: cloneFloors(next.floors),
        layoutMetadata: withSavedViewsOf(state.layoutMetadata, next.layoutMetadata),
        selectedId: next.selectedId,
        selectedFloor: next.selectedFloor,
        floorHeight: next.floorHeight,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        pointerIntent: 'idle',
        ...markUnsaved(),
      }
    }),
  addFloorAbove: () =>
    set((state) => {
      const level = Math.max(...state.floors.map((f) => f.level)) + 1
      const floor: CanvasFloor = {
        id: nextId('floor'),
        name: floorName(level),
        level,
        elevation: level * state.floorHeight,
      }
      return {
        floors: [...state.floors, floor],
        selectedFloor: level,
        selectedId: null,
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  addFloorBelow: () =>
    set((state) => {
      const level = Math.min(...state.floors.map((f) => f.level)) - 1
      const floor: CanvasFloor = {
        id: nextId('floor'),
        name: floorName(level),
        level,
        elevation: level * state.floorHeight,
      }
      return {
        floors: [...state.floors, floor],
        selectedFloor: level,
        selectedId: null,
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  removeFloor: (level) =>
    set((state) => {
      if (state.floors.length <= 1) return state
      const floors = state.floors.filter((f) => f.level !== level)
      const rooms = state.rooms.filter((room) => room.floorLevel !== level)
      const fallbackLevel = floors[floors.length - 1].level
      return {
        floors,
        rooms,
        selectedFloor: state.selectedFloor === level ? fallbackLevel : state.selectedFloor,
        selectedId: null,
        ...pushHistory(state),
        ...markUnsaved(),
      }
    }),
  loadRooms: (rooms) => {
    const layout = {
      version: '1.0',
      rooms,
      building: { floorHeight: DEFAULT_FLOOR_HEIGHT },
    }
    get().loadLayout(layout)
  },
  loadLayout: (layout) => {
    const { floors, rooms, floorHeight } = normalizeLayout(layout)
    // viewMode is deliberately left untouched: switching 2D/3D/zoning/graph
    // must survive generation, refine, restore, and recovery loads.
    set({
      rooms,
      floors,
      selectedFloor: floors[0]?.level ?? 0,
      floorHeight,
      designId: layout.designId ?? null,
      designVersionId: layout.designVersionId ?? null,
      layoutMetadata: layout.metadata ?? {},
      generationInsights: layout.insights ?? null,
      selectedId: null,
      interactionMode: 'select',
      pointerIntent: 'idle',
      saveStatus: 'saved',
      lastSavedAt: new Date().toISOString(),
      ...CLEAN_DRAFT_STATE,
      activityLog: [],
      past: [],
      future: [],
      placementMode: null,
      measureMode: false,
      measurePoints: [],
    })
  },
  clearLayout: () =>
    set({
      rooms: [],
      floors: [DEFAULT_FLOOR],
      selectedFloor: 0,
      floorHeight: DEFAULT_FLOOR_HEIGHT,
      designId: null,
      designVersionId: null,
      layoutMetadata: {},
      generationInsights: null,
      selectedId: null,
      interactionMode: 'select',
      pointerIntent: 'idle',
      saveStatus: 'saved',
      lastSavedAt: null,
      ...CLEAN_DRAFT_STATE,
      activityLog: [],
      past: [],
      future: [],
      clipboard: null,
      clipboardMessage: null,
      placementMode: null,
      measureMode: false,
      measurePoints: [],
    }),
  serializeLayout: () => {
    const state = get()
    const floors = state.floors.map((floor) => ({
      ...floor,
      rooms: state.rooms.filter((room) => room.floorLevel === floor.level),
    }))
    return {
      version: '1.0',
      ...(state.designId ? { designId: state.designId } : {}),
      ...(state.designVersionId ? { designVersionId: state.designVersionId } : {}),
      metadata: {
        ...state.layoutMetadata,
        totalFloors: state.floors.length,
        totalRooms: state.rooms.filter((room) => room.objectType === 'room').length,
        totalObjects: state.rooms.length,
      },
      ...(state.generationInsights ? { insights: state.generationInsights } : {}),
      building: { floorHeight: state.floorHeight },
      floors,
      rooms: state.rooms,
    }
  },
}))

function queueAutoSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
}
