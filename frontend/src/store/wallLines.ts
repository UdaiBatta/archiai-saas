import type { Room } from './canvasStore'
import { quarterTurnPlanSize } from '../utils/quarterTurn'

/**
 * Walls are derived from rooms, so "editing a wall" means moving the room
 * edges it stands on. A wall line is every engine wall piece on one straight
 * line that touches the picked one (walls between different room pairs read
 * as one wall), plus the room edges lying on it, on either side.
 */
export interface WallRun {
  /** 'x': the line is x = at (runs along z); 'z': the line is z = at. */
  axis: 'x' | 'z'
  at: number
  from: number
  to: number
  wallIds: string[]
  /** Rooms whose min or max edge (on `axis`) lies on the line. */
  edges: { id: string; side: 'min' | 'max' }[]
}

export const MIN_ROOM_SIDE = 1
const ON_LINE = 0.15
const TOUCH = 0.05

const isEngineWall = (o: Room) => o.objectType === 'wall' && o.derived === 'engine'

function wallLine(wall: Room): { axis: 'x' | 'z'; at: number; from: number; to: number } {
  const alongX = wall.size.w >= wall.size.d
  return alongX
    ? { axis: 'z', at: wall.position.z, from: wall.position.x - wall.size.w / 2, to: wall.position.x + wall.size.w / 2 }
    : { axis: 'x', at: wall.position.x, from: wall.position.z - wall.size.d / 2, to: wall.position.z + wall.size.d / 2 }
}

function bounds(room: Room) {
  const { w, d } = quarterTurnPlanSize(room.size, room.rotation.y)
  return { x0: room.position.x - w / 2, x1: room.position.x + w / 2, z0: room.position.z - d / 2, z1: room.position.z + d / 2 }
}

export function wallRun(objects: Room[], wallId: string): WallRun | null {
  const picked = objects.find((o) => o.id === wallId)
  if (!picked || !isEngineWall(picked)) return null
  const line = wallLine(picked)
  const level = picked.floorLevel ?? 0
  const candidates = objects
    .filter((o) => isEngineWall(o) && (o.floorLevel ?? 0) === level)
    .map((o) => ({ id: o.id, ...wallLine(o) }))
    .filter((w) => w.axis === line.axis && Math.abs(w.at - line.at) < ON_LINE)

  // Grow the span through touching pieces.
  let { from, to } = line
  const ids = new Set([picked.id])
  for (let grew = true; grew; ) {
    grew = false
    for (const w of candidates) {
      if (ids.has(w.id) || w.to < from - TOUCH || w.from > to + TOUCH) continue
      ids.add(w.id)
      from = Math.min(from, w.from)
      to = Math.max(to, w.to)
      grew = true
    }
  }

  const edges: WallRun['edges'] = []
  for (const room of objects) {
    if (room.objectType !== 'room' || room.polygonVertices || (room.floorLevel ?? 0) !== level) continue
    const b = bounds(room)
    const [lo, hi, a0, a1] = line.axis === 'x' ? [b.z0, b.z1, b.x0, b.x1] : [b.x0, b.x1, b.z0, b.z1]
    if (Math.min(hi, to) - Math.max(lo, from) < TOUCH) continue
    if (Math.abs(a0 - line.at) < ON_LINE) edges.push({ id: room.id, side: 'min' })
    else if (Math.abs(a1 - line.at) < ON_LINE) edges.push({ id: room.id, side: 'max' })
  }
  return { axis: line.axis, at: line.at, from, to, wallIds: [...ids], edges }
}

/** The move limited so no room on the line gets narrower than MIN_ROOM_SIDE. */
export function clampWallDelta(objects: Room[], run: WallRun, delta: number): number {
  let lo = -Infinity
  let hi = Infinity
  for (const edge of run.edges) {
    const room = objects.find((o) => o.id === edge.id)
    if (!room) continue
    const b = bounds(room)
    const span = run.axis === 'x' ? b.x1 - b.x0 : b.z1 - b.z0
    const slack = Math.max(0, span - MIN_ROOM_SIDE)
    if (edge.side === 'min') hi = Math.min(hi, slack)
    else lo = Math.max(lo, -slack)
  }
  return Math.min(hi, Math.max(lo, delta))
}

/** Rooms on the line resized by `delta`; the line's walls and their doors shifted with it. */
export function moveWallRun(objects: Room[], run: WallRun, delta: number): Room[] {
  const d = clampWallDelta(objects, run, delta)
  if (d === 0) return objects
  const sides = new Map(run.edges.map((e) => [e.id, e.side]))
  const walls = new Set(run.wallIds)
  const key = run.axis
  return objects.map((o) => {
    const side = sides.get(o.id)
    if (side) {
      const b = bounds(o)
      const [lo, hi] = key === 'x' ? [b.x0, b.x1] : [b.z0, b.z1]
      const [nlo, nhi] = side === 'min' ? [lo + d, hi] : [lo, hi + d]
      const world = key === 'x' ? { w: nhi - nlo, d: b.z1 - b.z0 } : { w: b.x1 - b.x0, d: nhi - nlo }
      const local = quarterTurnPlanSize(world, o.rotation.y)
      return {
        ...o,
        position: { ...o.position, [key]: (nlo + nhi) / 2 },
        size: { ...o.size, w: local.w, d: local.d },
      }
    }
    if (walls.has(o.id) || (o.hostWallId && walls.has(String(o.hostWallId)))) {
      return { ...o, position: { ...o.position, [key]: o.position[key] + d } }
    }
    return o
  })
}
