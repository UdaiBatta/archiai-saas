/**
 * A room's outline as editable points: a box room is its 4 corners, a shaped
 * room its polygon. Dragging a point or an edge's midpoint (which adds a
 * point) reshapes it, up to MAX_ROOM_POINTS. All points are world x/z.
 */
import { quarterTurnPlanSize } from '../utils/quarterTurn'
import type { Room } from './canvasStore'

export interface OutlinePoint {
  x: number
  z: number
}

export const MAX_ROOM_POINTS = 12
export const MIN_ROOM_POINTS = 3

const EPS = 1e-3
const round3 = (value: number) => Math.round(value * 1000) / 1000

export function roomOutline(room: Pick<Room, 'polygonVertices' | 'position' | 'size' | 'rotation'>): OutlinePoint[] {
  if (room.polygonVertices && room.polygonVertices.length >= MIN_ROOM_POINTS) {
    return room.polygonVertices.map((v) => ({ x: v.x, z: v.z }))
  }
  const { w, d } = quarterTurnPlanSize(room.size, room.rotation.y)
  const { x, z } = room.position
  return [
    { x: x - w / 2, z: z - d / 2 },
    { x: x + w / 2, z: z - d / 2 },
    { x: x + w / 2, z: z + d / 2 },
    { x: x - w / 2, z: z + d / 2 },
  ]
}

const cross = (o: OutlinePoint, a: OutlinePoint, b: OutlinePoint) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)

/** Drop repeated points and points on a straight line between their neighbours. */
export function simplifyOutline(points: OutlinePoint[]): OutlinePoint[] {
  // One point at a time: two copies of a point must not both go.
  const current = [...points]
  for (;;) {
    const i = current.findIndex((p, i) => {
      const prev = current[(i - 1 + current.length) % current.length]
      const after = current[(i + 1) % current.length]
      return Math.hypot(p.x - prev.x, p.z - prev.z) < EPS || Math.abs(cross(prev, p, after)) <= EPS
    })
    if (i < 0 || current.length <= MIN_ROOM_POINTS) return current
    current.splice(i, 1)
  }
}

function segmentsCross(a: OutlinePoint, b: OutlinePoint, c: OutlinePoint, d: OutlinePoint) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
}

/** True when two non-neighbouring edges cross: not a valid room. */
export function selfIntersects(points: OutlinePoint[]): boolean {
  const n = points.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true
    }
  }
  return false
}

const signedArea = (points: OutlinePoint[]) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]
    return sum + p.x * q.z - q.x * p.z
  }, 0) / 2

/** The room fields for an outline, or null when it is not a valid room. An
 * axis-aligned rectangle goes back to being a plain box room. */
export function outlinePatch(
  points: OutlinePoint[],
  room: Pick<Room, 'position' | 'size'>,
): Pick<Room, 'position' | 'size' | 'rotation' | 'polygonVertices'> | null {
  if (points.length < MIN_ROOM_POINTS || points.length > MAX_ROOM_POINTS) return null
  if (Math.abs(signedArea(points)) < 0.01 || selfIntersects(points)) return null
  const xs = points.map((p) => p.x)
  const zs = points.map((p) => p.z)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
  const box = points.length === 4 && points.every((p, i) => {
    const q = points[(i + 1) % 4]
    return Math.abs(p.x - q.x) < EPS || Math.abs(p.z - q.z) < EPS
  })
  return {
    position: { x: round3((x0 + x1) / 2), y: room.position.y, z: round3((z0 + z1) / 2) },
    size: { ...room.size, w: round3(x1 - x0), d: round3(z1 - z0) },
    rotation: { x: 0, y: 0, z: 0 },
    polygonVertices: box ? undefined : points.map((p) => ({ x: round3(p.x), z: round3(p.z) })),
  }
}

/** The outline moved `distance` inward on every side (mitred corners), so
 * neighbouring rooms drawn this way show a gap between them. */
export function insetOutline(points: OutlinePoint[], distance: number): OutlinePoint[] {
  const side = Math.sign(signedArea(points)) || 1
  const inward = (a: OutlinePoint, b: OutlinePoint) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1
    return { x: (-side * (b.z - a.z)) / length, z: (side * (b.x - a.x)) / length }
  }
  return points.map((p, i) => {
    const n1 = inward(points[(i - 1 + points.length) % points.length], p)
    const n2 = inward(p, points[(i + 1) % points.length])
    const bx = n1.x + n2.x, bz = n1.z + n2.z
    const length = Math.hypot(bx, bz) || 1
    // Mitre length grows at sharp corners; cap it so a spike stays put.
    const along = Math.min(distance / Math.max((bx * n1.x + bz * n1.z) / length, 1e-6), distance * 3)
    return { x: p.x + (bx / length) * along, z: p.z + (bz / length) * along }
  })
}
