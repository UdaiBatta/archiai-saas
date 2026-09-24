import { useMemo } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { EDITOR_PALETTE, ZONE_META } from './editorPalette'
import { derivePlanBounds } from './plan2dGeometry'
import { PlanDirectionLabels } from './PlanDirectionLabels'
import { parseOrientation } from './orientationModel'
import { formatArea } from '../../utils/format'
import { isZonableObject, zoneForRoom } from './zoneModel'
import { useAccessGraph } from './useAccessGraph'
import { zoneEntrances } from './roomGraphModel'
import { ZONE_ORDER } from './editorPalette'

interface ZoningViewProps {
  className?: string
}

/**
 * Zoning lens over the shared layout state: every space is filled with its
 * zone color (public/private/collaborative/service/circulation/utility).
 * Zones are derived client-side from room types — a documented placeholder
 * until real zoning data exists — so the view always stays connected to
 * the actual layout objects. Clicking a space selects the same object the
 * 2D/3D editors see.
 */
export function ZoningView({ className }: ZoningViewProps) {
  const rooms = useCanvasStore((s) => s.rooms)
  const floors = useCanvasStore((s) => s.floors)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  const deselectAll = useCanvasStore((s) => s.deselectAll)
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)

  const sortedFloors = useMemo(
    () => [...floors].sort((left, right) => left.level - right.level),
    [floors],
  )
  const activeFloor =
    selectedFloor === 'all'
      ? sortedFloors[0]
      : sortedFloors.find((floor) => floor.level === selectedFloor) ?? sortedFloors[0]
  const activeLevel = activeFloor?.level ?? 0

  const floorRooms = rooms.filter((room) => (room.floorLevel ?? 0) === activeLevel)
  const zonableRooms = floorRooms.filter(isZonableObject)
  const bounds = useMemo(
    () => derivePlanBounds(activeFloor?.footprint, zonableRooms),
    [activeFloor?.footprint, zonableRooms],
  )
  const fontSize = Math.max(0.2, Math.min(0.5, Math.max(bounds.w, bounds.d) / 40))

  const orientation = parseOrientation(layoutMetadata)
  const graph = useAccessGraph(activeLevel)
  const entrances = useMemo(() => zoneEntrances(graph), [graph])
  const entranceZone = graph.nodes.find((node) => node.id === graph.entranceId)?.zone
  const presentZones = ZONE_ORDER.filter((zone) => graph.nodes.some((node) => node.zone === zone))
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id

  return (
    <div className={`relative overflow-hidden bg-graphite-900 ${className ?? ''}`}>
      <svg
        role="application"
        aria-label="Zoning view"
        data-testid="zoning-canvas"
        className="h-full w-full select-none"
        viewBox={`${bounds.x} ${bounds.z} ${bounds.w} ${bounds.d}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(event) => {
          if (event.button === 0) deselectAll()
        }}
      >
        {activeFloor?.footprint && (
          <rect
            x={activeFloor.footprint.x}
            y={activeFloor.footprint.z}
            width={activeFloor.footprint.w}
            height={activeFloor.footprint.d}
            fill={EDITOR_PALETTE.planSheetStart}
            stroke={EDITOR_PALETTE.planFrame}
            strokeWidth={Math.max(0.05, fontSize * 0.14)}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {zonableRooms.map((room) => {
          const zone = zoneForRoom(room)
          const selected = room.id === selectedId
          const labelFits = room.size.w >= fontSize * 3 && room.size.d >= fontSize * 2
          return (
            <g
              key={room.id}
              role="button"
              aria-label={`${room.label}, ${ZONE_META[zone].label} zone`}
              data-testid={`zoning-object-${room.id}`}
              transform={`translate(${room.position.x} ${room.position.z}) rotate(${room.rotation.y || 0})`}
              style={{ cursor: 'pointer' }}
              onPointerDown={(event) => {
                event.stopPropagation()
                if (event.button === 0) selectRoom(room.id)
              }}
            >
              <rect
                x={-room.size.w / 2}
                y={-room.size.d / 2}
                width={room.size.w}
                height={room.size.d}
                fill={ZONE_META[zone].color}
                fillOpacity={selected ? 0.95 : 0.78}
                stroke={selected ? '#FFFFFF' : '#BDBDC0'}
                strokeWidth={selected ? Math.max(0.06, fontSize * 0.16) : Math.max(0.02, fontSize * 0.06)}
                vectorEffect="non-scaling-stroke"
              />
              {labelFits && (
                <g pointerEvents="none">
                  <text
                    x={0}
                    y={-fontSize * 0.1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize * 0.9}
                    fontWeight={selected ? 700 : 600}
                    fill="#F5F5F6"
                  >
                    {room.label}
                  </text>
                  <text
                    x={0}
                    y={fontSize * 0.95}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={fontSize * 0.62}
                    fill="#DFDFE1"
                    fillOpacity={0.85}
                  >
                    {ZONE_META[zone].label} · {formatArea(room.size.w * room.size.d)}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        {orientation && activeFloor?.footprint && (
          <PlanDirectionLabels
            footprint={activeFloor.footprint}
            orientation={orientation}
            fontSize={fontSize}
          />
        )}
      </svg>

      {graph.hasConnectionData && presentZones.length > 0 && (
        <aside
          aria-label="How zones connect"
          className="absolute right-3 top-28 z-10 w-[min(18rem,calc(100%-1.5rem))] rounded-xl border border-ink/10 bg-graphite-800/95 p-3 text-xs shadow-xl backdrop-blur"
        >
          <h2 className="mb-2 text-[11px] font-semibold text-ink">How zones connect</h2>
          <ul className="space-y-1.5">
            {presentZones.map((zone) => {
              const entry = entrances.get(zone)
              return (
                <li key={zone} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: ZONE_META[zone].color }} />
                  <span className="text-muted">
                    <span className="font-semibold text-ink">{ZONE_META[zone].label}</span>{' '}
                    {zone === entranceZone
                      ? 'holds the entrance.'
                      : entry
                        ? `entered from ${[...entry.from].map(labelOf).join(', ')} (${entry.doors} door${entry.doors === 1 ? '' : 's'}${entry.open ? `, ${entry.open} open` : ''}).`
                        : 'has no way in from another zone.'}
                  </span>
                </li>
              )
            })}
          </ul>
        </aside>
      )}

      {zonableRooms.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-light">
          Add rooms or generate a layout to see zoning for this floor.
        </div>
      )}
    </div>
  )
}
