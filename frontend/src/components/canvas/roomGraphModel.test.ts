import { describe, expect, it } from 'vitest'

import type { Room } from '../../store/canvasStore'
import type { RoomEdge } from '../../types/contracts'
import { buildRoomGraph, connectionsFor, effectiveEdges, zoneEntrances } from './roomGraphModel'

function room(id: string, roomType: string, x = 0, extra: Partial<Room> = {}): Room {
  return {
    id, label: id, objectType: 'room', roomType, floorLevel: 0,
    position: { x, y: 1.5, z: 0 }, size: { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 }, color: '#000', ...extra,
  } as Room
}

// entry | living | corridor | bed, with a bathroom behind the bedroom.
const ROOMS = [
  room('Entry', 'entry', 0),
  room('Living', 'living_room', 4),
  room('Corridor', 'corridor', 8),
  room('Bed', 'bedroom', 12),
  room('Bath', 'bathroom', 16),
]
const EDGES: RoomEdge[] = [
  { rooms: ['Entry', 'Living'], kind: 'open' },
  { rooms: ['Corridor', 'Living'], kind: 'open' },
  { rooms: ['Bed', 'Corridor'], kind: 'door' },
  { rooms: ['Bath', 'Bed'], kind: 'door' },
]

describe('access graph', () => {
  it('measures depth and the route from the entrance', () => {
    const graph = buildRoomGraph(ROOMS, 0, EDGES)
    expect(graph.entranceId).toBe('Entry')
    expect(Object.fromEntries(graph.nodes.map((n) => [n.id, n.depth]))).toEqual({
      Entry: 0, Living: 1, Corridor: 2, Bed: 3, Bath: 4,
    })
    expect(graph.routes.get('Bath')).toEqual(['Entry', 'Living', 'Corridor', 'Bed', 'Bath'])
  })

  it('calls a bathroom behind one bedroom an en-suite, not a problem', () => {
    const graph = buildRoomGraph(ROOMS, 0, EDGES)
    expect(graph.findings).toEqual([
      { roomId: 'Bath', severity: 'info', message: 'Bath is reached through Bed (en-suite).' },
    ])
  })

  it('flags a room with no way in, and a bedroom opened onto public space', () => {
    const edges = effectiveEdges(EDGES, [
      { room_a: 'Corridor', room_b: 'Bed', kind: 'wall' },
    ])
    const walled = buildRoomGraph(ROOMS, 0, edges)
    expect(walled.nodes.find((n) => n.id === 'Bed')!.depth).toBeNull()
    expect(walled.findings.map((f) => f.message)).toContain(
      "Bed can't be reached from the entrance: it has no door or opening.",
    )

    const opened = buildRoomGraph(ROOMS, 0, effectiveEdges(EDGES, [
      { room_a: 'Bed', room_b: 'Corridor', kind: 'open' },
    ]))
    expect(opened.findings.map((f) => f.message)).toContain('Bed is open to Corridor: no door for privacy.')
  })

  it('flags a bedroom reachable only through another bedroom', () => {
    const rooms = [...ROOMS, room('Bed 2', 'bedroom', 12, { position: { x: 12, y: 1.5, z: 4 } })]
    const graph = buildRoomGraph(rooms, 0, [...EDGES, { rooms: ['Bed', 'Bed 2'], kind: 'door' }])
    expect(graph.findings).toContainEqual({
      roomId: 'Bed 2', severity: 'warn', message: 'Bed 2 can only be reached by walking through Bed.',
    })
  })

  it('takes the entrance from the front door when there is one', () => {
    const objects = [
      ...ROOMS,
      { ...room('w', 'wall', 18), objectType: 'wall' } as Room,
      { ...room('d', 'door', 18), objectType: 'door', hostWallId: 'w' } as Room,
    ]
    expect(buildRoomGraph(objects, 0, EDGES).entranceId).toBe('Bath')
  })

  it('ignores user choices for rooms that do not share a wall', () => {
    expect(effectiveEdges(EDGES, [{ room_a: 'Entry', room_b: 'Bath', kind: 'door' }])).toEqual(EDGES)
  })

  it('reports how each zone is entered', () => {
    const entries = zoneEntrances(buildRoomGraph(ROOMS, 0, EDGES))
    expect([...entries.get('private')!.from]).toEqual(['Corridor'])
    expect(entries.get('private')!.doors).toBe(1)
  })

  it('lists a node connections with the other endpoint', () => {
    const graph = buildRoomGraph(ROOMS, 0, EDGES)
    expect(connectionsFor(graph.edges, 'Bed')).toEqual([
      { otherId: 'Corridor', kind: 'door' },
      { otherId: 'Bath', kind: 'door' },
    ])
  })
})
