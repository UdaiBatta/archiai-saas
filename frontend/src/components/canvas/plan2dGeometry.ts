import type { Room } from '../../store/canvasStore'
import { COMPONENT_REGISTRY, clampComponentSize } from '../../store/componentRegistry'
import { quarterTurnPlanDirection, quarterTurnPlanSize } from '../../utils/quarterTurn'

export interface PlanBounds {
  x: number
  z: number
  w: number
  d: number
}

export interface PlanPoint {
  x: number
  z: number
}

export interface PlanClientRect {
  left: number
  top: number
  width: number
  height: number
}

export interface PlanViewportMetrics {
  left: number
  top: number
  width: number
  height: number
  scale: number
}

export interface PlanResizeHandle {
  key: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  sx: -1 | 0 | 1
  sz: -1 | 0 | 1
}

export const PLAN_RESIZE_HANDLES: PlanResizeHandle[] = [
  { key: 'nw', sx: -1, sz: -1 },
  { key: 'n', sx: 0, sz: -1 },
  { key: 'ne', sx: 1, sz: -1 },
  { key: 'e', sx: 1, sz: 0 },
  { key: 'se', sx: 1, sz: 1 },
  { key: 's', sx: 0, sz: 1 },
  { key: 'sw', sx: -1, sz: 1 },
  { key: 'w', sx: -1, sz: 0 },
]

function validBounds(bounds: PlanBounds | undefined): bounds is PlanBounds {
  return Boolean(
    bounds &&
      Number.isFinite(bounds.x) &&
      Number.isFinite(bounds.z) &&
      Number.isFinite(bounds.w) &&
      Number.isFinite(bounds.d) &&
      bounds.w > 0 &&
      bounds.d > 0,
  )
}

export function derivePlanBounds(footprint: PlanBounds | undefined, rooms: Room[]): PlanBounds {
  let content: PlanBounds
  if (validBounds(footprint)) {
    content = footprint
  } else if (rooms.length > 0) {
    const minX = Math.min(...rooms.map((room) => room.position.x - room.size.w / 2))
    const maxX = Math.max(...rooms.map((room) => room.position.x + room.size.w / 2))
    const minZ = Math.min(...rooms.map((room) => room.position.z - room.size.d / 2))
    const maxZ = Math.max(...rooms.map((room) => room.position.z + room.size.d / 2))
    content = {
      x: minX,
      z: minZ,
      w: Math.max(1, maxX - minX),
      d: Math.max(1, maxZ - minZ),
    }
  } else {
    content = { x: 0, z: 0, w: 16, d: 12 }
  }

  // The editor chrome occupies the top and bottom of the viewport. Reserve
  // asymmetric drawing space so dimensions, the entry marker, and the
  // command bar never compete with the footprint.
  const sidePadding = Math.max(1.8, Math.max(content.w, content.d) * 0.12)
  const topPadding = sidePadding * 0.9
  const bottomPadding = sidePadding * 1.65
  return {
    x: content.x - sidePadding,
    z: content.z - topPadding,
    w: content.w + sidePadding * 2,
    d: content.d + topPadding + bottomPadding,
  }
}

export function clientPointToPlan(
  clientX: number,
  clientY: number,
  rect: PlanClientRect,
  viewBox: PlanBounds,
): PlanPoint {
  const viewport = planViewportMetrics(rect, viewBox)
  const localX = Math.min(viewport.width, Math.max(0, clientX - viewport.left))
  const localY = Math.min(viewport.height, Math.max(0, clientY - viewport.top))
  return {
    x: viewBox.x + localX / viewport.scale,
    z: viewBox.z + localY / viewport.scale,
  }
}

export function planViewportMetrics(
  rect: PlanClientRect,
  viewBox: PlanBounds,
): PlanViewportMetrics {
  const width = rect.width || 1
  const height = rect.height || 1
  const scale = Math.max(0.000001, Math.min(width / viewBox.w, height / viewBox.d))
  const renderedWidth = viewBox.w * scale
  const renderedHeight = viewBox.d * scale
  return {
    left: rect.left + (width - renderedWidth) / 2,
    top: rect.top + (height - renderedHeight) / 2,
    width: renderedWidth,
    height: renderedHeight,
    scale,
  }
}

function snappedDimension(value: number, enabled: boolean, gridSize: number) {
  if (!enabled || gridSize <= 0) return value
  return Math.max(gridSize, Math.round(value / gridSize) * gridSize)
}

function maxAnchoredSpan(
  anchor: number,
  direction: number,
  min: number,
  span: number,
) {
  if (direction > 0) return min + span - anchor
  if (direction < 0) return anchor - min
  return Number.POSITIVE_INFINITY
}

/**
 * Handles are drawn inside the object's rotated group, so `handle.sx/sz` are
 * local directions while `point` is a world plan coordinate. The whole resize
 * therefore runs on the world axes (like the 3D corner grips) and converts the
 * result back to local box dimensions, so a quarter-turned room resizes along
 * the edge the user actually grabbed.
 */
export function resizeRoomFromPlanHandle({
  room,
  handle,
  point,
  snapToGrid,
  gridSize,
  footprint,
}: {
  room: Room
  handle: PlanResizeHandle
  point: PlanPoint
  snapToGrid: boolean
  gridSize: number
  footprint?: PlanBounds
}) {
  const rotationY = room.rotation.y
  const world = quarterTurnPlanDirection(handle, rotationY)
  const startWorldSize = quarterTurnPlanSize(room.size, rotationY)
  const anchorX = room.position.x - (world.sx * startWorldSize.w) / 2
  const anchorZ = room.position.z - (world.sz * startWorldSize.d) / 2
  const rawWorldSize = {
    w:
      world.sx === 0
        ? startWorldSize.w
        : snappedDimension(Math.abs(point.x - anchorX), snapToGrid, gridSize),
    d:
      world.sz === 0
        ? startWorldSize.d
        : snappedDimension(Math.abs(point.z - anchorZ), snapToGrid, gridSize),
  }
  const definition = COMPONENT_REGISTRY[room.objectType]
  const size = clampComponentSize(
    room.objectType,
    { ...room.size, ...quarterTurnPlanSize(rawWorldSize, rotationY) },
    room.size,
  )
  const worldSize = quarterTurnPlanSize(size, rotationY)

  if (validBounds(footprint)) {
    const worldMinSize = quarterTurnPlanSize(definition.minSize, rotationY)
    if (world.sx !== 0) {
      const maxW = maxAnchoredSpan(anchorX, world.sx, footprint.x, footprint.w)
      worldSize.w = Math.max(worldMinSize.w, Math.min(worldSize.w, maxW))
    }
    if (world.sz !== 0) {
      const maxD = maxAnchoredSpan(anchorZ, world.sz, footprint.z, footprint.d)
      worldSize.d = Math.max(worldMinSize.d, Math.min(worldSize.d, maxD))
    }
  }

  const localPlanSize = quarterTurnPlanSize(worldSize, rotationY)
  return {
    size: { ...size, w: localPlanSize.w, d: localPlanSize.d },
    position: {
      x: world.sx === 0 ? room.position.x : anchorX + (world.sx * worldSize.w) / 2,
      y: room.position.y,
      z: world.sz === 0 ? room.position.z : anchorZ + (world.sz * worldSize.d) / 2,
    },
  }
}

export function snappedCoord(value: number, enabled: boolean, gridSize: number) {
  if (!enabled || gridSize <= 0) return value
  return Math.round(value / gridSize) * gridSize
}

function polygonBounds(vertices: PlanPoint[]) {
  const xs = vertices.map((vertex) => vertex.x)
  const zs = vertices.map((vertex) => vertex.z)
  const minX = Math.min(...xs)
  const minZ = Math.min(...zs)
  return { minX, minZ, maxX: Math.max(...xs), maxZ: Math.max(...zs) }
}

/** Rebuilds `position`/`size` as the vertices' own bounding box - kept in
 * sync so every existing consumer that only reads position/size (labels,
 * dimension badges, footprint checks) still works for a polygon room. */
function boundsUpdate(vertices: PlanPoint[], room: Room) {
  const { minX, minZ, maxX, maxZ } = polygonBounds(vertices)
  return {
    polygonVertices: vertices,
    position: { x: (minX + maxX) / 2, y: room.position.y, z: (minZ + maxZ) / 2 },
    size: { ...room.size, w: Math.max(maxX - minX, 0.01), d: Math.max(maxZ - minZ, 0.01) },
  }
}

/**
 * Polygon rooms are never rotated (backend-enforced), so - unlike the
 * rectangular resize above - a vertex's world coordinate needs no local/
 * world conversion: it just moves to `point`, clamped to the floor's
 * footprint like every other move/resize gesture.
 */
export function movePolygonVertex({
  room,
  vertexIndex,
  point,
  snapToGrid,
  gridSize,
  footprint,
}: {
  room: Room
  vertexIndex: number
  point: PlanPoint
  snapToGrid: boolean
  gridSize: number
  footprint?: PlanBounds
}) {
  const vertices = room.polygonVertices
  if (!vertices || vertexIndex < 0 || vertexIndex >= vertices.length) return null
  let x = snappedCoord(point.x, snapToGrid, gridSize)
  let z = snappedCoord(point.z, snapToGrid, gridSize)
  if (validBounds(footprint)) {
    x = Math.min(footprint.x + footprint.w, Math.max(footprint.x, x))
    z = Math.min(footprint.z + footprint.d, Math.max(footprint.z, z))
  }
  const nextVertices = vertices.map((vertex, index) =>
    index === vertexIndex ? { x, z } : vertex,
  )
  return boundsUpdate(nextVertices, room)
}

/** Double-click an edge midpoint to add a vertex there. */
export function insertPolygonVertex(room: Room, edgeStartIndex: number) {
  const vertices = room.polygonVertices
  if (!vertices || vertices.length < 2) return null
  const a = vertices[edgeStartIndex]
  const b = vertices[(edgeStartIndex + 1) % vertices.length]
  const midpoint = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  const nextVertices = [
    ...vertices.slice(0, edgeStartIndex + 1),
    midpoint,
    ...vertices.slice(edgeStartIndex + 1),
  ]
  return boundsUpdate(nextVertices, room)
}

/** Double-click a vertex to remove it - refused below 3 vertices, since a
 * polygon room's outline cannot degenerate to a line or point. */
export function removePolygonVertex(room: Room, vertexIndex: number) {
  const vertices = room.polygonVertices
  if (!vertices || vertices.length <= 3) return null
  const nextVertices = vertices.filter((_, index) => index !== vertexIndex)
  return boundsUpdate(nextVertices, room)
}
