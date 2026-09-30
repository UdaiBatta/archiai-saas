import { Html } from '@react-three/drei'
import { useCanvasStore } from '../../store/canvasStore'
import type { ConnectionKind } from '../../types/contracts'
import { NEXT_KIND, useHoveredNeighbour, useNeighbours } from './RoomConnections'
import { roomWorldBounds } from './topViewModel'

const KIND_COLOR: Record<ConnectionKind, string> = { wall: '#4f7cc4', door: '#ff5a1f', open: '#2fa36b' }

/**
 * The selected room's neighbours (or the two rooms a selected wall divides),
 * tinted by how they connect, each with a tag that cycles wall → door → open.
 * `planY` lifts the tint above the Top view's flat plan.
 */
export function NeighbourHighlights({ planY, readOnly }: { planY?: number; readOnly: boolean }) {
  const selected = useCanvasStore((s) => s.rooms.find((room) => room.id === s.selectedId))
  const rooms = useCanvasStore((s) => s.rooms)
  const setConnection = useCanvasStore((s) => s.setConnection)
  const hovered = useHoveredNeighbour((s) => s.id)
  const pair = Array.isArray(selected?.separates) && selected.separates.length === 2 ? (selected.separates as string[]) : null
  const centre = selected?.objectType === 'room' ? selected.id : pair?.[0] ?? null
  const neighbours = useNeighbours(centre).filter((n) => !pair || n.otherId === pair[1])
  if (!selected || !centre) return null

  const highlights = neighbours.flatMap((n) => {
    const room = rooms.find((r) => r.id === n.otherId)
    return room ? [{ ...n, room }] : []
  })
  const own = pair ? rooms.find((r) => r.id === pair[0]) : undefined

  return (
    <group>
      {own && <Tint room={own} color="#ffffff" strong={false} planY={planY} />}
      {highlights.map(({ otherId, kind, label, room }) => {
        const strong = hovered === otherId
        const b = roomWorldBounds(room)
        const y = planY ?? room.position.y - room.size.h / 2 + 0.06
        return (
          <group key={otherId}>
            <Tint room={room} color={KIND_COLOR[kind]} strong={strong} planY={planY} />
            <Html position={[b.x + b.w / 2, y + 0.05, b.z + b.d / 2]} center zIndexRange={[20, 0]}>
              <button
                type="button"
                disabled={readOnly}
                onPointerEnter={() => useHoveredNeighbour.getState().set(otherId)}
                onPointerLeave={() => useHoveredNeighbour.getState().set(null)}
                // Keep the click out of the 3D view (it would deselect or pick what is behind).
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setConnection(centre, otherId, NEXT_KIND[kind])
                }}
                title={`${label}: ${kind}. Click for ${NEXT_KIND[kind]}`}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium shadow-sm backdrop-blur transition-transform ${
                  strong ? 'scale-110 border-ink/30 bg-graphite-800 text-ink' : 'border-ink/10 bg-graphite-800/95 text-muted'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: KIND_COLOR[kind] }} />
                {label}
                <span className="capitalize text-muted-light">{kind}</span>
              </button>
            </Html>
          </group>
        )
      })}
    </group>
  )
}

function Tint({ room, color, strong, planY }: { room: { position: { x: number; y: number; z: number }; size: { w: number; h: number; d: number }; rotation: { x: number; y: number; z: number } }; color: string; strong: boolean; planY?: number }) {
  const b = roomWorldBounds(room)
  const y = planY ?? room.position.y - room.size.h / 2 + 0.06
  return (
    <mesh position={[b.x + b.w / 2, y, b.z + b.d / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2}>
      <planeGeometry args={[Math.max(b.w - 0.12, 0.1), Math.max(b.d - 0.12, 0.1)]} />
      <meshBasicMaterial color={color} transparent opacity={strong ? 0.6 : 0.34} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}
