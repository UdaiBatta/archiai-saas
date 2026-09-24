import { useCanvasStore } from '../../store/canvasStore'
import type { ConnectionKind, RoomEdge } from '../../types/contracts'

const KINDS: { kind: ConnectionKind; label: string; hint: string }[] = [
  { kind: 'wall', label: 'Wall', hint: 'Solid wall, no way through' },
  { kind: 'door', label: 'Door', hint: 'Wall with a door (drag the door to move it)' },
  { kind: 'open', label: 'Open', hint: 'No wall and no door: one continuous space' },
]

/** How the selected room meets each neighbour, with a wall/door/open switch. */
export function RoomConnections({ roomId, disabled = false }: { roomId: string; disabled?: boolean }) {
  const edges = useCanvasStore((s) => s.layoutMetadata.mvpEdges)
  const rooms = useCanvasStore((s) => s.rooms)
  const setConnection = useCanvasStore((s) => s.setConnection)

  const neighbours = (Array.isArray(edges) ? (edges as RoomEdge[]) : [])
    .filter((edge) => edge.rooms.includes(roomId))
    .map((edge) => {
      const otherId = edge.rooms[0] === roomId ? edge.rooms[1] : edge.rooms[0]
      return { otherId, kind: edge.kind, label: rooms.find((r) => r.id === otherId)?.label ?? otherId }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  if (neighbours.length === 0) return null

  return (
    <section aria-label="Connections" className="mt-4">
      <h3 className="mb-2 text-[11px] font-semibold text-ink">Connections</h3>
      <ul className="space-y-1.5">
        {neighbours.map(({ otherId, kind, label }) => (
          <li key={otherId} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs text-muted">{label}</span>
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
                    kind === option.kind ? 'bg-accent text-white' : 'text-muted hover:bg-ink/5 hover:text-ink'
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
