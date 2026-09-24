import type { CanvasLayout, Room } from '../store/canvasStore'
import type {
  Connection,
  Facing,
  GenerateMvpResponse,
  HardQualitySnapshot,
  LayoutPlan,
  MvpQualitySnapshot,
  RequirementsSpec,
  RoomEdge,
} from '../types/contracts'
import { canonicalQuarterTurn, quarterTurnSwapsAxes } from '../utils/quarterTurn'

const WALL_HEIGHT_M = 3
const FALLBACK_COLOR = '#94a3b8'

const ROOM_COLORS: Partial<Record<string, string>> = {
  living_room: '#b3b8e9',
  kitchen: '#6bc0a1',
  master_bedroom: '#dea97d',
  bedroom: '#e4a6c6',
  bathroom: '#9abbe4',
  dining: '#d6bd5d',
  study: '#d2b7ed',
  entry: '#7d8795',
  balcony: '#80cc9c',
  parking: '#888380',
  utility: '#e4e7ec',
}

interface AdapterOptions {
  prompt?: string
  requirements?: RequirementsSpec
  quality?: MvpQualitySnapshot | HardQualitySnapshot
  designId?: string | null
  designVersionId?: string | null
}

function round3(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

function boundedCenter(origin: number, span: number, plotSpan: number) {
  const half = span / 2
  // Edges are millimetre-aligned; odd-millimetre widths need a half-mm
  // centre. Rounding that centre independently shifts shared room edges.
  return Math.min(plotSpan - half, Math.max(half, origin + half))
}

function isPlanRoomType(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function wallObject(layout: LayoutPlan, index: number): Room {
  const wall = layout.walls[index]
  const floor = wall.floor ?? 0
  const dx = wall.x2 - wall.x1
  const dy = wall.y2 - wall.y1
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const length = Math.hypot(dx, dy)
  return {
    id: wall.id,
    label: `Wall ${index + 1}`,
    roomType: 'wall',
    objectType: 'wall',
    floorId: `floor_${floor}`,
    floorLevel: floor,
    position: {
      x: round3((wall.x1 + wall.x2) / 2),
      y: floor * WALL_HEIGHT_M + WALL_HEIGHT_M / 2,
      z: round3((wall.y1 + wall.y2) / 2),
    },
    size: {
      w: round3(horizontal ? length : wall.thickness),
      h: WALL_HEIGHT_M,
      d: round3(horizontal ? wall.thickness : length),
    },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#475569',
    ...(wall.rooms?.length === 2 ? { betweenRooms: [...wall.rooms] } : {}),
  }
}

/** Every adjacent room pair and how it currently meets: open (no wall),
 * door (a wall with a door in it) or wall (solid). */
export function edgesFromLayout(layout: LayoutPlan): RoomEdge[] {
  const doored = new Set(layout.doors.map((door) => door.wall_ref))
  const byPair = new Map<string, RoomEdge>()
  for (const wall of layout.walls) {
    if (wall.rooms?.length !== 2) continue
    const rooms = [...wall.rooms].sort() as [string, string]
    const key = rooms.join('|')
    const kind = wall.kind === 'open' ? 'open' : doored.has(wall.id) ? 'door' : 'wall'
    const previous = byPair.get(key)
    // A pair can share several wall segments; any door wins over solid wall.
    if (!previous || (previous.kind === 'wall' && kind === 'door')) {
      byPair.set(key, { rooms, kind })
    }
  }
  return [...byPair.values()]
}

function doorObject(layout: LayoutPlan, index: number): Room | null {
  const door = layout.doors[index]
  const wall = layout.walls.find((candidate) => candidate.id === door.wall_ref)
  if (!wall) return null
  const floor = door.floor ?? wall.floor ?? 0

  const dx = wall.x2 - wall.x1
  const dy = wall.y2 - wall.y1
  const length = Math.hypot(dx, dy)
  const at = Math.min(door.offset + door.width / 2, length)
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const markerThickness = Math.max(wall.thickness * 1.5, 0.16)
  return {
    id: door.id,
    label: `Door ${index + 1}`,
    roomType: 'door',
    objectType: 'door',
    floorId: `floor_${floor}`,
    floorLevel: floor,
    hostWallId: wall.id,
    position: {
      x: round3(wall.x1 + (length ? dx / length : 0) * at),
      y: floor * WALL_HEIGHT_M + 1.05,
      z: round3(wall.y1 + (length ? dy / length : 0) * at),
    },
    size: {
      w: round3(horizontal ? door.width : markerThickness),
      h: 2.1,
      d: round3(horizontal ? markerThickness : door.width),
    },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#a0702c',
  }
}

export function layoutPlanDerivedObjects(layout: LayoutPlan): Room[] {
  const wallObjects = layout.walls.flatMap((wall, index) =>
    wall.kind === 'open' ? [] : [wallObject(layout, index)],
  )
  const doorObjects = layout.doors
    .map((_, index) => doorObject(layout, index))
    .filter((door): door is Room => door !== null)
  return [...wallObjects, ...doorObjects]
}

/**
 * Canonical MVP walls and hosted doors are regenerated from room rectangles.
 * Preserve every editable room and non-canonical component while replacing
 * only those derived objects with the server's scored geometry.
 */
export function replaceDerivedCanvasObjects(
  objects: Room[],
  layout: LayoutPlan,
): Room[] {
  const preserved = objects.filter(
    (object) => object.objectType !== 'wall' && object.objectType !== 'door',
  )
  return [...preserved, ...layoutPlanDerivedObjects(layout)]
}

export function layoutPlanToCanvas(
  layout: LayoutPlan,
  options: AdapterOptions = {},
): CanvasLayout {
  const roomObjects: Room[] = layout.rooms.map((room) => {
    const swapsAxes = quarterTurnSwapsAxes(room.rotation)
    const floor = room.floor ?? 0
    const centerX = boundedCenter(room.x, room.w, layout.plot.width_m)
    const centerZ = boundedCenter(room.y, room.h, layout.plot.depth_m)
    // `vertices` are already in the same NW-origin world frame as x/y (no
    // rotation to undo - the backend enforces rotation=0 whenever vertices
    // are set), so they carry over 1:1. `boundedCenter` can still nudge a
    // room fully inside the plot on a clamped edge; shift every vertex by
    // that same delta so the outline stays consistent with its own bbox.
    const shiftX = centerX - (room.x + room.w / 2)
    const shiftZ = centerZ - (room.y + room.h / 2)
    return {
      id: room.id,
      label: room.label,
      roomType: room.type,
      objectType:
        room.type === 'staircase' || room.type === 'stairs' ? 'stair' : 'room',
      floorId: `floor_${floor}`,
      floorLevel: floor,
      position: {
        x: centerX,
        y: floor * WALL_HEIGHT_M + WALL_HEIGHT_M / 2,
        z: centerZ,
      },
      size: {
        w: swapsAxes ? room.h : room.w,
        h: WALL_HEIGHT_M,
        d: swapsAxes ? room.w : room.h,
      },
      rotation: { x: 0, y: room.rotation, z: 0 },
      color: ROOM_COLORS[room.type] ?? FALLBACK_COLOR,
      ...(room.zone_id ? { zoneId: room.zone_id } : {}),
      ...(room.vertices?.length
        ? {
            polygonVertices: room.vertices.map((vertex) => ({
              x: round3(vertex.x + shiftX),
              z: round3(vertex.y + shiftZ),
            })),
          }
        : {}),
    }
  })
  const objects = [...roomObjects, ...layoutPlanDerivedObjects(layout)]
  const totalFloors =
    Math.max(0, ...layout.rooms.map((room) => room.floor ?? 0)) + 1
  const footprint = {
    x: 0,
    z: 0,
    w: layout.plot.width_m,
    d: layout.plot.depth_m,
  }
  const totalAreaSqm = round3(
    layout.rooms.reduce((total, room) => total + room.w * room.h, 0),
  )

  return {
    version: '1.0',
    designId: options.designId ?? undefined,
    designVersionId: options.designVersionId ?? undefined,
    metadata: {
      pipeline: 'mvp',
      prompt: options.prompt,
      building_type: options.requirements?.building_type ?? 'house',
      buildingType: options.requirements?.building_type ?? 'house',
      room_count: roomObjects.length,
      totalFloors,
      totalRooms: roomObjects.length,
      totalObjects: objects.length,
      totalAreaSqm,
      placementEngine: 'mvp_subdivision',
      mvpRequirements: options.requirements,
      mvpQuality: options.quality,
      mvpVastuEnabled: /va?astu/i.test(options.prompt ?? ''),
      mvpEdges: edgesFromLayout(layout),
      mvpConnections: layout.connections ?? [],
      ...(layout.archetype_reasons?.length
        ? { archetypeReasons: layout.archetype_reasons }
        : {}),
    },
    building: {
      floorHeight: WALL_HEIGHT_M,
      footprint,
    },
    floors: Array.from({ length: totalFloors }, (_, floor) => ({
      id: `floor_${floor}`,
      name:
        floor === 0 ? 'Ground Floor' : floor === 1 ? 'First Floor' : `Floor ${floor}`,
      level: floor,
      elevation: floor * WALL_HEIGHT_M,
      footprint,
      rooms: objects.filter((object) => (object.floorLevel ?? 0) === floor),
    })),
    rooms: objects,
  }
}

/**
 * Convert the editor's center-based objects back to the locked NW-origin MVP
 * contract for post-edit validation, covering every room object plus the
 * wall/hosted-door objects emitted by this adapter.
 *
 * Every `objectType: 'room'` object is included — `PlanRoom.type` is an open
 * string validated against the server's space catalog, and the engine already
 * emits types outside the twelve residential ones (e.g. the injected
 * `corridor`). Filtering those out here silently deleted them from the plan
 * sent for scoring, which made every room they served report `unreachable`.
 */
export function canvasObjectsToLayoutPlan(
  objects: Room[],
  footprint: { x: number; z: number; w: number; d: number },
  facing: Facing,
  connections: Connection[] = [],
): LayoutPlan {
  const rooms = objects
    .filter(
      (object) =>
        (object.objectType === 'room' || object.objectType === 'stair')
        && isPlanRoomType(object.roomType),
    )
    .map((room) => {
      // A polygon room's bounding box is derived from its own vertices, not
      // from position/size - those two are kept roughly in sync by the
      // vertex-edit helpers, but the vertices are the source of truth the
      // backend actually validates against (`x/y/w/h` is documented as the
      // bounding box "only" whenever `vertices` is set).
      if (room.polygonVertices?.length) {
        const xs = room.polygonVertices.map((vertex) => vertex.x - footprint.x)
        const zs = room.polygonVertices.map((vertex) => vertex.z - footprint.z)
        const minX = Math.min(...xs)
        const minZ = Math.min(...zs)
        return {
          id: room.id,
          type: room.roomType as string,
          label: room.label,
          x: round3(minX),
          y: round3(minZ),
          w: round3(Math.max(...xs) - minX),
          h: round3(Math.max(...zs) - minZ),
          rotation: 0 as const,
          floor: room.floorLevel ?? 0,
          vertices: room.polygonVertices.map((vertex) => ({
            x: round3(vertex.x - footprint.x),
            y: round3(vertex.z - footprint.z),
          })),
          ...(typeof room.zoneId === 'string' ? { zone_id: room.zoneId } : {}),
        }
      }
      const rotation = canonicalQuarterTurn(room.rotation.y)
      const swapsAxes = quarterTurnSwapsAxes(rotation)
      const worldWidth = swapsAxes ? room.size.d : room.size.w
      const worldDepth = swapsAxes ? room.size.w : room.size.d
      return {
        id: room.id,
        type: room.roomType as string,
        label: room.label,
        x: round3(room.position.x - worldWidth / 2 - footprint.x),
        y: round3(room.position.z - worldDepth / 2 - footprint.z),
        w: round3(worldWidth),
        h: round3(worldDepth),
        rotation,
        floor: room.floorLevel ?? 0,
        ...(typeof room.zoneId === 'string' ? { zone_id: room.zoneId } : {}),
      }
    })

  const wallObjects = objects.filter((object) => object.objectType === 'wall')
  const walls = wallObjects.map((wall) => {
    const horizontal = wall.size.w >= wall.size.d
    const length = horizontal ? wall.size.w : wall.size.d
    return {
      id: wall.id,
      x1: round3(
        horizontal
          ? wall.position.x - length / 2 - footprint.x
          : wall.position.x - footprint.x,
      ),
      y1: round3(
        horizontal
          ? wall.position.z - footprint.z
          : wall.position.z - length / 2 - footprint.z,
      ),
      x2: round3(
        horizontal
          ? wall.position.x + length / 2 - footprint.x
          : wall.position.x - footprint.x,
      ),
      y2: round3(
        horizontal
          ? wall.position.z - footprint.z
          : wall.position.z + length / 2 - footprint.z,
      ),
      thickness: round3(horizontal ? wall.size.d : wall.size.w),
      floor: wall.floorLevel ?? 0,
      ...(Array.isArray(wall.betweenRooms) ? { rooms: wall.betweenRooms as string[] } : {}),
    }
  })
  const wallById = new Map(walls.map((wall) => [wall.id, wall]))

  const doors = objects.flatMap((door) => {
    if (door.objectType !== 'door' || typeof door.hostWallId !== 'string') return []
    const wall = wallById.get(door.hostWallId)
    if (!wall) return []
    const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1)
    const width = horizontal ? door.size.w : door.size.d
    const centerAlong = horizontal
      ? door.position.x - footprint.x - wall.x1
      : door.position.z - footprint.z - wall.y1
    return [{
      id: door.id,
      wall_ref: wall.id,
      offset: round3(Math.max(0, centerAlong - width / 2)),
      width: round3(width),
      floor: door.floorLevel ?? wall.floor ?? 0,
    }]
  })

  return {
    plot: { width_m: footprint.w, depth_m: footprint.d, facing },
    rooms,
    walls,
    doors,
    ...(connections.length ? { connections } : {}),
  }
}

export function generateResponseToCanvas(
  response: GenerateMvpResponse,
  prompt?: string,
): CanvasLayout {
  return layoutPlanToCanvas(response.layout, {
    prompt,
    requirements: response.requirements,
    quality: response.quality,
    designId: response.designId,
    designVersionId: response.designVersionId,
  })
}
