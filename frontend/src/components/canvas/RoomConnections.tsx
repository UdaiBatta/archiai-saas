import { create } from 'zustand'
import { useCanvasStore } from '../../store/canvasStore'
import { doorBetween } from '../../store/connections'
import type { Connection, ConnectionKind, RoomEdge } from '../../types/contracts'
import { effectiveEdges } from './roomGraphModel'

const KINDS: { kind: ConnectionKind; label: string; hint: string }[] = [
  { kind: 'wall', label: 'Wall', hint: 'Solid wall, no way through' },
  { kind: 'door', label: 'Door', hint: 'Wall with a door (drag the door to move it)' },
  { kind: 'open', label: 'Open', hint: 'No wall and no door: one continuous space' },
]

export const NEXT_KIND: Record<ConnectionKind, ConnectionKind> = { wall: 'door', door: 'open', open: 'wall' }

/** The neighbour row under the pointer, so the 3D view can light that room up. */
export const useHoveredNeighbour = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({
  id: null,
  set: (id) => set({ id }),
}))

export interface Neighbour {
  otherId: string
  kind: ConnectionKind
  label: string
}

/** Rooms sharing an edge with `roomId`, and how each meets it. */
export function useNeighbours(roomId: string | null): Neighbour[] {
  const edges = useCanvasStore((s) => s.layoutMetadata.mvpEdges)
  const connections = useCanvasStore((s) => s.layoutMetadata.mvpConnections)
  const rooms = useCanvasStore((s) => s.rooms)
  if (!roomId) return []
  return effectiveEdges(
    Array.isArray(edges) ? (edges as RoomEdge[]) : [],
    Array.isArray(connections) ? (connections as Connection[]) : [],
  )
    .filter((edge) => edge.rooms.includes(roomId))
    .map((edge) => {
      const otherId = edge.rooms[0] === roomId ? edge.rooms[1] : edge.rooms[0]
      return { otherId, kind: edge.kind, label: rooms.find((r) => r.id === otherId)?.label ?? otherId }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * How the selected room meets each neighbour, with a wall/door/open switch.
 * `onlyWith` narrows it to one pair (a selected wall between two rooms).
 */
export function RoomConnections({ roomId, onlyWith, disabled = false }: { roomId: string; onlyWith?: string; disabled?: boolean }) {
  const setConnection = useCanvasStore((s) => s.setConnection)
  const hover = useHoveredNeighbour((s) => s.set)
  const ownLabel = useCanvasStore((s) => s.rooms.find((r) => r.id === roomId)?.label ?? roomId)
  const neighbours = useNeighbours(roomId).filter((n) => !onlyWith || n.otherId === onlyWith)

  if (neighbours.length === 0) return null

  return (
    <section aria-label="Connections" className="mt-4" onMouseLeave={() => hover(null)}>
      <h3 className="mb-1 text-[11px] font-semibold text-ink">{onlyWith ? 'Connection' : 'Connections'}</h3>
      {!onlyWith && <p className="mb-2 text-[10.5px] text-muted-light">Neighbours are outlined in the view; point at one to find it.</p>}
      <ul className="space-y-1">
        {neighbours.map(({ otherId, kind, label }) => (
          <li
            key={otherId}
            onMouseEnter={() => hover(otherId)}
            className="-mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-0.5 hover:bg-ink/5"
          >
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="min-w-0 truncate text-xs text-muted">{onlyWith ? `${ownLabel} ↔ ${label}` : label}</span>
              {kind === 'door' && (
                <button
                  type="button"
                  title="Select the door to slide it along the wall"
                  onClick={() => {
                    const door = doorBetween(useCanvasStore.getState().rooms, roomId, otherId)
                    if (door) useCanvasStore.getState().selectRoom(door.id)
                  }}
                  className="shrink-0 text-[10px] text-muted-light underline-offset-2 hover:text-ink hover:underline"
                >
                  Move door
                </button>
              )}
            </span>
            <div role="radiogroup" aria-label={`Connection to ${label}`} className="flex shrink-0 overflow-hidden rounded-md border border-ink/10">
              {KINDS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.kind}
                  title={option.hint}
                  disabled={disabled}
                  onClick={() => kind !== option.kind && setConnection(roomId, otherId, option.kind)}
                  className={`px-2 py-1 text-[10.5px] font-medium disabled:opacity-50 ${
                    kind === option.kind ? 'bg-accent text-graphite-950' : 'text-muted hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
