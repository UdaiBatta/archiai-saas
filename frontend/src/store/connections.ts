import type { Connection, ConnectionKind } from '../types/contracts'
import type { Room } from './canvasStore'

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** Replace (or add) the user's choice for one room pair. */
export function upsertConnection(
  connections: Connection[],
  roomA: string,
  roomB: string,
  kind: ConnectionKind,
  at: number | null = null,
  width: number | null = null,
): Connection[] {
  const samePair = (c: Connection) =>
    (c.room_a === roomA && c.room_b === roomB) || (c.room_a === roomB && c.room_b === roomA)
  return [...connections.filter((c) => !samePair(c)), { room_a: roomA, room_b: roomB, kind, at, ...(width ? { width } : {}) }]
}

/** The derived door in the wall between two rooms, if there is one. */
export function doorBetween(objects: Room[], roomA: string, roomB: string): Room | undefined {
  const walls = new Set(
    objects
      .filter((o) => {
        const pair = o.betweenRooms ?? o.separates
        return o.objectType === 'wall' && Array.isArray(pair) && pair.includes(roomA) && pair.includes(roomB)
      })
      .map((wall) => wall.id),
  )
  return objects.find((o) => o.objectType === 'door' && walls.has(String(o.hostWallId)))
}

/** The point `at` (0..1) of the way along a wall, on its centre line. */
export function wallPoint(wall: Room, at: number): { x: number; z: number } {
  const horizontal = wall.size.w >= wall.size.d
  const length = horizontal ? wall.size.w : wall.size.d
  const along = (horizontal ? wall.position.x : wall.position.z) - length / 2 + at * length
  return horizontal ? { x: along, z: wall.position.z } : { x: wall.position.x, z: along }
}

/**
 * Project a dragged door onto its host wall: the door slides along the wall
 * (never off it) and `at` is its centre as a 0..1 fraction of the wall, the
 * form the server stores in a door connection.
 */
export function snapDoorToWall(
  door: Room,
  wall: Room,
  target: { x: number; z: number },
): { position: Room['position']; at: number } {
  const horizontal = wall.size.w >= wall.size.d
  const length = horizontal ? wall.size.w : wall.size.d
  const width = Math.min(Math.max(door.size.w, door.size.d), length)
  const start = (horizontal ? wall.position.x : wall.position.z) - length / 2
  const along = (horizontal ? target.x : target.z) - start
  const centre = Math.min(Math.max(along, width / 2), length - width / 2)
  const at = length > 0 ? round3(centre / length) : 0.5
  return {
    position: {
      x: round3(horizontal ? start + centre : wall.position.x),
      y: door.position.y,
      z: round3(horizontal ? wall.position.z : start + centre),
    },
    at,
  }
}
