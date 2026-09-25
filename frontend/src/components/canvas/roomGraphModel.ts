import type { Room } from '../../store/canvasStore'
import type { Connection, ConnectionKind, RoomEdge } from '../../types/contracts'
import type { ZoneType } from './editorPalette'
import { isZonableObject, zoneForRoom } from './zoneModel'

/**
 * The access graph: rooms are nodes, and two adjacent rooms are joined by how
 * they actually meet — a door, an open edge, or a solid wall (adjacent but no
 * way through). Laid out as a justified graph: depth = rooms passed from the
 * entrance, the standard way architects read a plan's access structure.
 */

export interface RoomGraphNode {
  id: string
  label: string
  zone: ZoneType
  areaSqm: number
  /** Rooms passed from the entrance (entrance = 0); null = unreachable. */
  depth: number | null
}

export interface RoomGraphEdge {
  source: string
  target: string
  kind: ConnectionKind
}

export interface GraphFinding {
  roomId: string
  severity: 'warn' | 'info'
  message: string
}

export interface AccessGraph {
  nodes: RoomGraphNode[]
  edges: RoomGraphEdge[]
  entranceId: string | null
  /** Room id -> ids from the entrance to it (inclusive), shortest route. */
  routes: Map<string, string[]>
  findings: GraphFinding[]
}

const ENTRANCE_TYPES = ['entry', 'foyer', 'lobby', 'reception', 'living_room', 'hallway', 'corridor']
const SANITARY = new Set(['bathroom', 'ensuite', 'toilet', 'washroom', 'wc'])
const DOOR_TOUCH = 0.3

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * The server's last-synced edges with the user's newer choices laid over
 * them, so the graph moves the instant a door changes rather than after the
 * validation round-trip.
 */
export function effectiveEdges(serverEdges: RoomEdge[], connections: Connection[]): RoomEdge[] {
  const byPair = new Map(serverEdges.map((edge) => [pairKey(edge.rooms[0], edge.rooms[1]), edge]))
  for (const connection of connections) {
    const key = pairKey(connection.room_a, connection.room_b)
    const edge = byPair.get(key)
    if (edge) byPair.set(key, { rooms: edge.rooms, kind: connection.kind })
  }
  return [...byPair.values()]
}

function touches(room: Room, x: number, z: number) {
  const halfW = room.size.w / 2 + DOOR_TOUCH
  const halfD = room.size.d / 2 + DOOR_TOUCH
  return Math.abs(x - room.position.x) <= halfW && Math.abs(z - room.position.z) <= halfD
}

/** The room the front door opens into, else the most public room. */
function findEntrance(objects: Room[], spaces: Room[]): string | null {
  const interiorWalls = new Set(
    objects.filter((o) => o.objectType === 'wall' && Array.isArray(o.betweenRooms)).map((o) => o.id),
  )
  for (const door of objects) {
    if (door.objectType !== 'door' || typeof door.hostWallId !== 'string') continue
    if (interiorWalls.has(door.hostWallId)) continue
    const room = spaces.find((space) => touches(space, door.position.x, door.position.z))
    if (room) return room.id
  }
  for (const type of ENTRANCE_TYPES) {
    const room = spaces.find((space) => space.roomType === type)
    if (room) return room.id
  }
  return spaces[0]?.id ?? null
}

function walk(start: string, links: Map<string, string[]>, blocked: (id: string) => boolean) {
  const parent = new Map<string, string | null>([[start, null]])
  const queue = [start]
  while (queue.length) {
    const current = queue.shift()!
    if (current !== start && blocked(current)) continue // may be reached, not passed through
    for (const next of links.get(current) ?? []) {
      if (parent.has(next)) continue
      parent.set(next, current)
      queue.push(next)
    }
  }
  return parent
}

function routeTo(id: string, parent: Map<string, string | null>) {
  const route: string[] = []
  for (let at: string | null | undefined = id; at != null; at = parent.get(at)) route.unshift(at)
  return route
}

export function buildRoomGraph(objects: Room[], activeLevel: number, serverEdges: RoomEdge[]): AccessGraph {
  const spaces = objects.filter(
    (room) => (room.floorLevel ?? 0) === activeLevel && isZonableObject(room),
  )
  const ids = new Set(spaces.map((room) => room.id))
  const byId = new Map(spaces.map((room) => [room.id, room]))
  const edges: RoomGraphEdge[] = serverEdges
    .filter((edge) => ids.has(edge.rooms[0]) && ids.has(edge.rooms[1]))
    .map((edge) => ({ source: edge.rooms[0], target: edge.rooms[1], kind: edge.kind }))

  const links = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.kind === 'wall') continue
    links.set(edge.source, [...(links.get(edge.source) ?? []), edge.target])
    links.set(edge.target, [...(links.get(edge.target) ?? []), edge.source])
  }

  const entranceId = findEntrance(objects.filter((o) => (o.floorLevel ?? 0) === activeLevel), spaces)
  const parent = entranceId ? walk(entranceId, links, () => false) : new Map<string, string | null>()
  const routes = new Map([...parent.keys()].map((id) => [id, routeTo(id, parent)]))

  const zoneOf = (id: string) => zoneForRoom(byId.get(id)!)
  const labelOf = (id: string) => byId.get(id)?.label ?? id
  const isSanitary = (id: string) => SANITARY.has(String(byId.get(id)?.roomType ?? ''))
  const findings: GraphFinding[] = []

  // Private rooms may be the destination but never a hallway.
  const privateWalk = entranceId
    ? walk(entranceId, links, (id) => zoneOf(id) === 'private')
    : new Map<string, string | null>()

  for (const room of spaces) {
    if (!parent.has(room.id)) {
      findings.push({
        roomId: room.id,
        severity: 'warn',
        message: `${room.label} can't be reached from the entrance: it has no door or opening.`,
      })
      continue
    }
    if (room.id === entranceId || privateWalk.has(room.id)) continue
    const through = (routes.get(room.id) ?? []).slice(1, -1).filter((id) => zoneOf(id) === 'private')
    const via = through.map(labelOf).join(', ')
    const ensuite = isSanitary(room.id) && through.length === 1 && !isSanitary(through[0])
    findings.push({
      roomId: room.id,
      severity: ensuite ? 'info' : 'warn',
      message: ensuite
        ? `${room.label} is reached through ${via} (en-suite).`
        : `${room.label} can only be reached by walking through ${via}.`,
    })
  }

  for (const edge of edges) {
    if (edge.kind !== 'open') continue
    const [a, b] = [edge.source, edge.target]
    const privateSide = zoneOf(a) === 'private' ? a : zoneOf(b) === 'private' ? b : null
    const other = privateSide === a ? b : a
    if (privateSide && zoneOf(other) !== 'private') {
      findings.push({
        roomId: privateSide,
        severity: 'warn',
        message: `${labelOf(privateSide)} is open to ${labelOf(other)}: no door for privacy.`,
      })
    }
  }

  findings.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'warn' ? -1 : 1))

  const nodes: RoomGraphNode[] = spaces.map((room) => ({
    id: room.id,
    label: room.label,
    zone: zoneForRoom(room),
    areaSqm: room.size.w * room.size.d,
    depth: routes.has(room.id) ? routes.get(room.id)!.length - 1 : null,
  }))

  return { nodes, edges, entranceId, routes, findings }
}

export function connectionsFor(edges: RoomGraphEdge[], nodeId: string) {
  return edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => ({
      otherId: edge.source === nodeId ? edge.target : edge.source,
      kind: edge.kind,
    }))
}

/** How each non-public zone is entered: which rooms outside it lead in, and how. */
export function zoneEntrances(graph: AccessGraph) {
  const zoneOf = new Map(graph.nodes.map((node) => [node.id, node.zone]))
  const entries = new Map<ZoneType, { from: Set<string>; doors: number; open: number }>()
  for (const edge of graph.edges) {
    if (edge.kind === 'wall') continue
    for (const [inside, outside] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const zone = zoneOf.get(inside)
      if (!zone || zone === zoneOf.get(outside)) continue
      const entry = entries.get(zone) ?? { from: new Set<string>(), doors: 0, open: 0 }
      entry.from.add(outside)
      if (edge.kind === 'door') entry.doors += 1
      else entry.open += 1
      entries.set(zone, entry)
    }
  }
  return entries
}
