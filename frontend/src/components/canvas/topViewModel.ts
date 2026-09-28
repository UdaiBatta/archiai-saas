/**
 * Pure plan-drawing math for the 3D Top view: adaptive room labels,
 * architectural dimension strings, handle placement and edit commits. Kept
 * free of React/three so it is testable without WebGL.
 *
 * World plan axes: x = east, z = south (screen-down in Top view).
 */
import type { Room } from '../../store/canvasStore'
import { formatMeters } from '../../utils/format'
import { quarterTurnPlanDirection, quarterTurnPlanSize } from '../../utils/quarterTurn'
import { PLAN_RESIZE_HANDLES, type PlanBounds, type PlanPoint, type PlanResizeHandle } from './plan2dGeometry'

/** Base label size in screen pixels. */
export const LABEL_PX = 12

/**
 * Adaptive room label: the name comes first and shrinks (to a floor) in
 * small rooms; the area line shows only when there is comfortably room for
 * both; below that the room shows no text (the Inspector has the details).
 * Same rule the SVG plan used, expressed in screen pixels.
 */
export function roomLabelLayout({
  label,
  w,
  d,
  pxPerMetre,
  isSpace,
  basePx = LABEL_PX,
}: {
  label: string
  w: number
  d: number
  pxPerMetre: number
  isSpace: boolean
  basePx?: number
}) {
  const wPx = w * pxPerMetre
  const dPx = d * pxPerMetre
  const nameFontPx = Math.min(basePx, (wPx * 0.85) / (Math.max(label.length, 4) * 0.58))
  const showName = nameFontPx >= basePx * 0.55 && dPx >= nameFontPx * 1.9
  const showArea =
    isSpace && showName && w * d >= 4 && wPx >= basePx * 4.5 && dPx >= basePx * 3.4
  return { nameFontPx, showName, showArea }
}

/** Floor area: the polygon's own (shoelace) area when it has one. */
export function roomPlanArea(room: Pick<Room, 'size' | 'polygonVertices'>) {
  const vertices = room.polygonVertices
  if (!vertices || vertices.length < 3) return room.size.w * room.size.d
  let twice = 0
  vertices.forEach((a, i) => {
    const b = vertices[(i + 1) % vertices.length]
    twice += a.x * b.z - b.x * a.z
  })
  return Math.abs(twice) / 2
}

/** The room's axis-aligned plan rectangle in world coordinates. */
export function roomWorldBounds(room: Pick<Room, 'position' | 'size' | 'rotation'>): PlanBounds {
  const size = quarterTurnPlanSize(room.size, room.rotation.y)
  return {
    x: room.position.x - size.w / 2,
    z: room.position.z - size.d / 2,
    w: size.w,
    d: size.d,
  }
}

export interface DimensionString {
  start: PlanPoint
  end: PlanPoint
  /** Short strokes across the line at each end. */
  ticks: [PlanPoint, PlanPoint][]
  /** Extension lines from the measured edge out to the dimension line. */
  extensions: [PlanPoint, PlanPoint][]
  label: PlanPoint
  text: string
  vertical: boolean
}

/**
 * Architectural dimension strings for a rectangle: width along its north
 * side and depth along its west side, each `offset` metres outside it.
 */
export function dimensionStrings(bounds: PlanBounds, offset: number, tick = offset * 0.3): DimensionString[] {
  const { x, z, w, d } = bounds
  const lineZ = z - offset
  const lineX = x - offset
  const gap = offset * 0.25
  return [
    {
      start: { x, z: lineZ },
      end: { x: x + w, z: lineZ },
      ticks: [x, x + w].map((tx) => [{ x: tx, z: lineZ - tick }, { x: tx, z: lineZ + tick }] as [PlanPoint, PlanPoint]),
      extensions: [x, x + w].map((tx) => [{ x: tx, z: z - gap }, { x: tx, z: lineZ - tick }] as [PlanPoint, PlanPoint]),
      label: { x: x + w / 2, z: lineZ },
      text: formatMeters(w),
      vertical: false,
    },
    {
      start: { x: lineX, z },
      end: { x: lineX, z: z + d },
      ticks: [z, z + d].map((tz) => [{ x: lineX - tick, z: tz }, { x: lineX + tick, z: tz }] as [PlanPoint, PlanPoint]),
      extensions: [z, z + d].map((tz) => [{ x: x - gap, z: tz }, { x: lineX - tick, z: tz }] as [PlanPoint, PlanPoint]),
      label: { x: lineX, z: z + d / 2 },
      text: formatMeters(d),
      vertical: true,
    },
  ]
}

/**
 * World positions of the eight plan resize handles. Placed through the same
 * local->world quarter-turn mapping `resizeRoomFromPlanHandle` uses, so
 * dragging a handle resizes the edge it sits on.
 */
export function planHandlePoints(room: Pick<Room, 'position' | 'size' | 'rotation'>) {
  const size = quarterTurnPlanSize(room.size, room.rotation.y)
  return PLAN_RESIZE_HANDLES.map((handle: PlanResizeHandle) => {
    const world = quarterTurnPlanDirection(handle, room.rotation.y)
    return {
      handle,
      x: room.position.x + (world.sx * size.w) / 2,
      z: room.position.z + (world.sz * size.d) / 2,
      cursor: world.sx === 0 ? 'ns-resize' : world.sz === 0 ? 'ew-resize' : world.sx === world.sz ? 'nwse-resize' : 'nesw-resize',
    }
  })
}

/** Midpoints of each polygon edge (index = edge start vertex). */
export function polygonEdgeMidpoints(vertices: PlanPoint[]): PlanPoint[] {
  return vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length]
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  })
}

export function cloneRoom(room: Room): Room {
  return {
    ...room,
    position: { ...room.position },
    size: { ...room.size },
    rotation: { ...room.rotation },
    polygonVertices: room.polygonVertices?.map((vertex) => ({ ...vertex })),
  }
}

const moved = (a: number, b: number) => Math.abs(a - b) > 0.001

/**
 * What a finished plan drag changed, as an `updateRoom` patch - or null when
 * nothing moved (a click, or a drag back to the start), so no history entry
 * is written.
 */
export function planEditPatch(start: Room, current: Room): Partial<Room> | null {
  const a = current.polygonVertices
  const b = start.polygonVertices
  const verticesChanged =
    a !== b &&
    (!a || !b || a.length !== b.length || a.some((v, i) => moved(v.x, b[i].x) || moved(v.z, b[i].z)))
  const geometryChanged =
    moved(current.position.x, start.position.x) ||
    moved(current.position.z, start.position.z) ||
    moved(current.size.w, start.size.w) ||
    moved(current.size.d, start.size.d) ||
    moved(current.size.h, start.size.h)
  if (!verticesChanged && !geometryChanged) return null
  return verticesChanged
    ? { polygonVertices: current.polygonVertices, position: current.position, size: current.size }
    : { position: current.position, size: current.size }
}
