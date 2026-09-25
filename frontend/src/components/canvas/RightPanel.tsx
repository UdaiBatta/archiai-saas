import { useMemo, useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { InspectorProperties } from './Inspector'
import { ZONE_META, displayRoomColor } from './editorPalette'
import { connectionsFor } from './roomGraphModel'
import { useAccessGraph } from './useAccessGraph'
import { isZonableObject, summarizeZones, zoneForRoom } from './zoneModel'
import { formatArea, formatDims, roomArea } from '../../utils/format'
import { cardinalName, parseOrientation } from './orientationModel'
import { ProgramCheck } from './ProgramCheck'
import { parseProgramValidation } from './programValidationModel'
import { QualityPanel } from './QualityPanel'
import { parseMvpQuality } from './qualityModel'

const ACTION_LABELS: Record<string, string> = {
  'object.added': 'Added',
  'object.deleted': 'Deleted',
  'object.duplicated': 'Duplicated',
  'object.pasted': 'Pasted',
  'object.moved': 'Moved',
  'object.resized': 'Resized',
  'object.rotated': 'Rotated',
  'object.renamed': 'Renamed',
  'object.updated': 'Updated',
}

type PanelTab = 'properties' | 'adjacencies' | 'activity'

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'adjacencies', label: 'Adjacency' },
  { id: 'activity', label: 'Activity' },
]

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-light">
      {children}
    </p>
  )
}

interface ProgramSummaryRow {
  type: string
  label: string
  count: number
}

function readableType(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ProgramSummaryCard({
  title,
  rows,
}: {
  title: string
  rows: ProgramSummaryRow[]
}) {
  if (rows.length === 0) return null
  return (
    <section
      data-testid="program-summary"
      className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3"
    >
      <h3 className="text-[11px] font-semibold text-ink">{title}</h3>
      <dl className="mt-2 flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.type} className="flex items-center gap-2 text-[10px]">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: displayRoomColor({
                  objectType: 'room',
                  roomType: row.type,
                  label: row.label,
                }),
              }}
            />
            <dt className="min-w-0 flex-1 truncate text-muted">{row.label}</dt>
            <dd className="font-mono tabular-nums text-ink">{row.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The persistent right sidebar for every editor view. Unlike the old
 * Inspector (which unmounted whenever nothing was selected, and never
 * existed in graph view), this panel is always present:
 *
 * - 2D / 3D with a selection: Properties | Adjacency | Activity tabs
 * - 2D / 3D without a selection: floor program summary + selection hint
 * - Zoning: zone legend with coverage, plus the selected room's zone
 * - Room Graph: relationships for the selected node + open-in-2D/3D
 */
export function RightPanel({ onCreateModel, open = true, onClose }: { onCreateModel?: () => void; open?: boolean; onClose?: () => void }) {
  const viewMode = useCanvasStore((s) => s.viewMode)
  const rooms = useCanvasStore((s) => s.rooms)
  const floors = useCanvasStore((s) => s.floors)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const activityLog = useCanvasStore((s) => s.activityLog)
  const [tab, setTab] = useState<PanelTab>('properties')
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)
  const orientation = parseOrientation(layoutMetadata)
  const designParams = (layoutMetadata.designParams ?? {}) as Record<string, unknown>
  const programConstraints = (layoutMetadata.programConstraints ?? {}) as {
    avoidPairs?: string[][]
    separations?: string[][]
    daylightRooms?: string[]
  }
  const programValidation = useMemo(
    () => parseProgramValidation(layoutMetadata),
    [layoutMetadata],
  )
  const mvpQuality = useMemo(
    () => parseMvpQuality(layoutMetadata),
    [layoutMetadata],
  )

  const room = rooms.find((r) => r.id === selectedId) ?? null
  const activeLevel =
    selectedFloor === 'all'
      ? Math.min(...floors.map((f) => f.level), 0)
      : selectedFloor
  const floorRooms = rooms.filter((r) => (r.floorLevel ?? 0) === activeLevel)
  const activeFloor = floors.find((f) => f.level === activeLevel)

  const graph = useAccessGraph(room?.floorLevel ?? activeLevel)
  const connections = room ? connectionsFor(graph.edges, room.id) : []
  const labelOf = (id: string) => rooms.find((r) => r.id === id)?.label ?? id

  const zoneSummary = useMemo(() => summarizeZones(floorRooms), [floorRooms])

  const objectActivity = room
    ? activityLog.filter((entry) => entry.objectId === room.id)
    : activityLog

  const spaceRooms = floorRooms.filter(
    (r) => COMPONENT_REGISTRY[r.objectType].category === 'space',
  )
  const netArea = spaceRooms.reduce((sum, r) => sum + roomArea(r.size), 0)
  const derivedCounts = new Map<string, number>()
  for (const space of spaceRooms) {
    const type = typeof space.roomType === 'string' && space.roomType
      ? space.roomType
      : space.objectType
    derivedCounts.set(type, (derivedCounts.get(type) ?? 0) + 1)
  }
  const requestedRows: ProgramSummaryRow[] = (programValidation?.spaces ?? [])
    .filter((space) => space.requestedCount > 0)
    .map((space) => ({
      type: space.normalizedType,
      label: readableType(space.normalizedType),
      count: space.requestedCount,
    }))
  const programRows = requestedRows.length > 0
    ? requestedRows
    : [...derivedCounts.entries()]
        .map(([type, count]) => ({ type, label: readableType(type), count }))
        .sort((left, right) => left.label.localeCompare(right.label))
  const buildingType =
    typeof layoutMetadata.buildingType === 'string'
      ? layoutMetadata.buildingType
      : typeof layoutMetadata.building_type === 'string'
        ? layoutMetadata.building_type
        : ''
  const bedroomCount = programRows
    .filter((row) => row.type.includes('bedroom'))
    .reduce((sum, row) => sum + row.count, 0)
  const residential = new Set([
    'apartment', 'house', 'studio', 'two_storey_home', 'bungalow', 'villa', 'townhouse',
  ]).has(buildingType)
  const summaryTitle = residential && bedroomCount > 0
    ? `${bedroomCount}BHK Summary`
    : buildingType
      ? `${readableType(buildingType)} Summary`
      : 'Program Summary'

  const connectionsList = (
    <ul className="flex flex-col gap-1">
      {connections.map((connection) => (
        <li key={connection.otherId}>
          <button
            type="button"
            onClick={() => selectRoom(connection.otherId)}
            className="flex w-full items-center justify-between gap-2 rounded-md bg-ink/5 px-2 py-1.5 text-left text-[11px] hover:bg-ink/10"
          >
            <span className="truncate text-ink">{labelOf(connection.otherId)}</span>
            <span className="shrink-0 text-[10px] text-muted-light">
              {connection.kind === 'door' ? 'Door' : connection.kind === 'open' ? 'Open' : 'Wall'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )

  const plotWidth = typeof designParams.plotWidthM === 'number' ? designParams.plotWidthM : null
  const plotDepth = typeof designParams.plotDepthM === 'number' ? designParams.plotDepthM : null
  const siteBlock =
    orientation || plotWidth ? (
      <div
        data-testid="site-orientation-block"
        className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3"
      >
        <SectionTitle>Site</SectionTitle>
        <dl className="mt-2 flex flex-col gap-1 text-[11px]">
          {orientation?.facingDirection && (
            <div className="flex justify-between">
              <dt className="text-muted-light">Facing</dt>
              <dd className="text-ink">{cardinalName(orientation.facingDirection)}</dd>
            </div>
          )}
          {orientation?.entrySide && (
            <div className="flex justify-between">
              <dt className="text-muted-light">Entry side</dt>
              <dd className="text-ink">{cardinalName(orientation.entrySide)}</dd>
            </div>
          )}
          {orientation?.roadSide && (
            <div className="flex justify-between">
              <dt className="text-muted-light">Road side</dt>
              <dd className="text-ink">{cardinalName(orientation.roadSide)}</dd>
            </div>
          )}
          {plotWidth && plotDepth && (
            <div className="flex justify-between">
              <dt className="text-muted-light">Plot</dt>
              <dd className="font-mono tabular-nums text-ink">{formatDims(plotWidth, plotDepth)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted-light">Floors</dt>
            <dd className="font-mono tabular-nums text-ink">{floors.length}</dd>
          </div>
        </dl>
      </div>
    ) : null

  // Per-room planning checks: exterior wall, daylight priority, and any
  // prompt-level avoid/separation constraints touching this room's type.
  const roomChecks: { label: string; ok: boolean }[] = []
  if (room && activeFloor?.footprint) {
    const fp = activeFloor.footprint
    const tol = 0.15
    const touchesExterior =
      Math.abs(room.position.x - room.size.w / 2 - fp.x) <= tol ||
      Math.abs(room.position.x + room.size.w / 2 - (fp.x + fp.w)) <= tol ||
      Math.abs(room.position.z - room.size.d / 2 - fp.z) <= tol ||
      Math.abs(room.position.z + room.size.d / 2 - (fp.z + fp.d)) <= tol
    roomChecks.push({ label: 'Exterior wall', ok: touchesExterior })
    const roomType = typeof room.roomType === 'string' ? room.roomType : ''
    const daylightRooms = orientation?.daylightRooms ?? programConstraints.daylightRooms ?? []
    if (roomType && daylightRooms.includes(roomType)) {
      roomChecks.push({ label: 'Daylight priority', ok: touchesExterior })
    }
    const directNeighbourTypes = new Set(
      connections
        .map((connection) => {
          const other = rooms.find((candidate) => candidate.id === connection.otherId)
          return typeof other?.roomType === 'string' ? other.roomType : ''
        }),
    )
    // Adjacency comes from the synced plan edges; without them "not
    // adjacent" would be a guess, so these checks are left out.
    const avoidPairs = graph.hasConnectionData ? programConstraints.avoidPairs ?? [] : []
    const separations = graph.hasConnectionData ? programConstraints.separations ?? [] : []
    for (const pair of avoidPairs) {
      if (!pair.includes(roomType)) continue
      const other = pair[0] === roomType ? pair[1] : pair[0]
      roomChecks.push({
        label: `Kept apart from ${other.replace(/_/g, ' ')}`,
        ok: !directNeighbourTypes.has(other),
      })
    }
    for (const pair of separations) {
      if (!pair.includes(roomType)) continue
      const other = pair[0] === roomType ? pair[1] : pair[0]
      roomChecks.push({
        label: `Away from ${other.replace(/_/g, ' ')}`,
        ok: !directNeighbourTypes.has(other),
      })
    }
  }

  let body: JSX.Element

  if (viewMode === 'zoning') {
    body = (
      <div className="flex flex-col gap-4" data-testid="zone-legend">
        {siteBlock}
        {programValidation && (
          <ProgramCheck
            validation={programValidation}
            selectedRoom={room}
            maxChecks={5}
          />
        )}
        <div>
          <SectionTitle>{`Zones — ${activeFloor?.name ?? 'Ground Floor'}`}</SectionTitle>
          {zoneSummary.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-light">
              Generate or add rooms to see zoning.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {zoneSummary.map((row) => (
                <li key={row.zone} className="text-[11px]">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="flex-1 text-ink">{row.label}</span>
                    <span className="font-mono tabular-nums text-muted">
                      {formatArea(row.areaSqm)} · {row.percent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="ml-4.5 mt-1 h-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.percent}%`, backgroundColor: row.color }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {room && isZonableObject(room) && (
          <div className="border-t border-ink/10 pt-3">
            <SectionTitle>Selected</SectionTitle>
            <p className="mt-1 text-sm font-semibold text-ink">{room.label}</p>
            <p className="text-[11px] text-muted">
              {ZONE_META[zoneForRoom(room)].label} zone · {formatArea(roomArea(room.size))}
            </p>
            <button
              type="button"
              onClick={() => setViewMode('floor_plan')}
              className="mt-2.5 w-full rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/5"
            >
              Edit in 2D Plan
            </button>
          </div>
        )}
        <p className="border-t border-ink/10 pt-3 text-[10px] leading-snug text-muted-light">
          Zones are derived from room types. Custom zone editing is coming soon.
        </p>
      </div>
    )
  } else if (viewMode === 'graph') {
    body = (
      <div className="flex flex-col gap-4" data-testid="room-graph-panel">
        {programValidation && (
          <ProgramCheck
            validation={programValidation}
            selectedRoom={room}
            maxChecks={5}
          />
        )}
        {room ? (
          <>
            <div>
              <SectionTitle>Relationships</SectionTitle>
              <p className="mt-1 text-sm font-semibold text-ink">{room.label}</p>
              <p className="text-[11px] text-muted">
                {ZONE_META[zoneForRoom(room)].label} zone · {formatArea(roomArea(room.size))}
              </p>
            </div>
            {connections.length === 0 ? (
              <p className="text-[11px] text-muted-light">
                No detected connections on this floor.
              </p>
            ) : (
              connectionsList
            )}
          </>
        ) : (
          <div>
            <SectionTitle>Spatial logic</SectionTitle>
            <div className="mt-2 flex flex-col gap-1 text-[11px] text-muted">
              <span>{graph.nodes.length} rooms on this floor</span>
              <span>
                {graph.edges.filter((edge) => edge.kind === 'door').length} doors ·{' '}
                {graph.edges.filter((edge) => edge.kind === 'open').length} open connections
              </span>
              <span>
                {graph.findings.filter((finding) => finding.severity === 'warn').length} access warnings
              </span>
              <span className="mt-1 text-[10px] leading-snug text-muted-light">
                Lines follow the plan's doors and openings. Click one in the
                graph to switch it between wall, door and open.
              </span>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t border-ink/10 pt-3">
          <button
            type="button"
            onClick={() => setViewMode('floor_plan')}
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs font-medium text-ink hover:bg-ink/5"
          >
            Open in 2D
          </button>
          <button
            type="button"
            onClick={() => setViewMode('3d')}
            className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs font-medium text-ink hover:bg-ink/5"
          >
            Open in 3D
          </button>
        </div>
      </div>
    )
  } else if (room && viewMode === 'floor_plan') {
    body = (
      <div className="flex flex-col gap-3" data-testid="plan-selection-panel">
        <section
          data-testid="selected-room-card"
          className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-9 w-9 shrink-0 rounded-sm border border-ink/15"
              style={{ backgroundColor: displayRoomColor(room) }}
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{room.label}</p>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted">
                {formatDims(room.size.w, room.size.d)} / {formatArea(roomArea(room.size))}
              </p>
            </div>
          </div>
        </section>

        <InspectorProperties room={room} />

        {programValidation ? (
          <ProgramCheck validation={programValidation} maxChecks={6} />
        ) : roomChecks.length > 0 ? (
          <section className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3">
            <h3 className="text-[11px] font-semibold text-ink">Program Check</h3>
            <ul data-testid="room-checks" className="mt-2 flex flex-col">
              {roomChecks.map((check) => (
                <li
                  key={check.label}
                  className="flex items-center justify-between gap-2 border-b border-ink/10 py-2 text-[10px] last:border-b-0"
                >
                  <span className="text-muted">{check.label}</span>
                  <span className={check.ok ? 'text-ok' : 'text-warn'}>
                    {check.ok ? 'Satisfied' : 'Warning'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ProgramSummaryCard title={summaryTitle} rows={programRows} />

        <details className="rounded-lg border border-ink/10 bg-[#232425]/55">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-[11px] font-semibold text-muted hover:text-ink">
            Adjacency and access
          </summary>
          <div className="border-t border-ink/10 p-3">
            {connections.length === 0 ? (
              <p className="text-[10px] text-muted-light">No detected adjacencies.</p>
            ) : (
              connectionsList
            )}
            <button
              type="button"
              onClick={() => setViewMode('graph')}
              className="mt-2 w-full rounded-md border border-ink/10 px-2 py-1.5 text-[10px] font-medium text-muted hover:bg-ink/5 hover:text-ink"
            >
              Open room graph
            </button>
          </div>
        </details>

        <details className="rounded-lg border border-ink/10 bg-[#232425]/55">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-[11px] font-semibold text-muted hover:text-ink">
            Recent activity
          </summary>
          <div className="flex flex-col gap-2 border-t border-ink/10 p-3">
            {objectActivity.length === 0 ? (
              <p className="text-[10px] text-muted-light">No edits to this object yet.</p>
            ) : (
              objectActivity.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-muted">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                  <span className="truncate text-muted-light">{entry.objectLabel}</span>
                </div>
              ))
            )}
          </div>
        </details>
      </div>
    )
  } else if (room) {
    body = (
      <>
        <div
          role="tablist"
          aria-label="Selection details"
          className="mb-3 flex items-center gap-0.5 rounded-lg bg-graphite-850 p-0.5"
        >
          {TABS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={tab === candidate.id}
              onClick={() => setTab(candidate.id)}
              className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                tab === candidate.id
                  ? 'bg-ink text-graphite-900'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        {tab === 'properties' && (
          <>
            {programValidation ? (
              <div className="mb-3">
                <ProgramCheck
                  validation={programValidation}
                  selectedRoom={room}
                  maxChecks={6}
                />
              </div>
            ) : roomChecks.length > 0 ? (
              <ul
                data-testid="room-checks"
                className="mb-3 flex flex-col gap-1 rounded-lg bg-graphite-850/80 p-2.5"
              >
                {roomChecks.map((check) => (
                  <li key={check.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted">{check.label}</span>
                    <span className={check.ok ? 'text-ok' : 'text-warn'}>
                      {check.ok ? 'Satisfied' : 'Warning'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <InspectorProperties room={room} />
          </>
        )}
        {tab === 'adjacencies' && (
          <div className="flex flex-col gap-3">
            <div>
              <SectionTitle>Adjacent spaces</SectionTitle>
              <p className="mt-1 text-[11px] text-muted-light">
                Rooms sharing a wall on {activeFloor?.name ?? 'this floor'}, and how you get between them.
              </p>
            </div>
            {connections.length === 0 ? (
              <p className="text-[11px] text-muted-light">
                No detected adjacencies for {room.label}.
              </p>
            ) : (
              connectionsList
            )}
            <button
              type="button"
              onClick={() => setViewMode('graph')}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/5"
            >
              View full room graph
            </button>
          </div>
        )}
        {tab === 'activity' && (
          <div className="flex flex-col gap-2">
            <SectionTitle>{`Edits — ${room.label}`}</SectionTitle>
            {objectActivity.length === 0 ? (
              <p className="text-[11px] text-muted-light">No edits to this object yet.</p>
            ) : (
              objectActivity.slice(0, 12).map((entry) => (
                <div key={entry.id} className="rounded-lg border border-ink/10 px-2 py-1.5">
                  <p className="text-xs font-medium text-ink/80">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  <p className="truncate text-[11px] text-muted">{entry.objectLabel}</p>
                </div>
              ))
            )}
          </div>
        )}
      </>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4" data-testid="right-panel-empty">
        {siteBlock}
        {programValidation && (
          <ProgramCheck validation={programValidation} maxChecks={6} />
        )}
        <div className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3">
          <SectionTitle>{activeFloor?.name ?? 'Floor'}</SectionTitle>
          <dl className="mt-2 grid grid-cols-2 gap-1.5">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-light">Spaces</dt>
              <dd className="font-mono text-xs tabular-nums text-ink">{spaceRooms.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-light">Net area</dt>
              <dd className="font-mono text-xs tabular-nums text-ink">{formatArea(netArea)}</dd>
            </div>
          </dl>
        </div>
        <ProgramSummaryCard title={summaryTitle} rows={programRows} />
        <p className="border-t border-ink/10 pt-3 text-[11px] leading-relaxed text-muted-light">
          {viewMode === '3d'
            ? 'Select a block to edit its properties. Blocks can be reshaped with the corner handles in plan view.'
            : 'Select a room to edit its properties, or use the tool rail to draw new components.'}
        </p>
      </div>
    )
  }

  const headerLabel =
    viewMode === 'zoning'
      ? 'Zoning'
      : viewMode === 'graph'
        ? 'Room Graph'
        : room
          ? COMPONENT_REGISTRY[room.objectType].label
          : 'No selection'

  return (
    <aside
      aria-label="Details panel"
      className={`${open ? 'flex' : 'hidden lg:flex'} absolute bottom-36 right-3 top-28 z-30 w-[min(19rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-ink/10 bg-[#1c1d1e]/95 backdrop-blur lg:static lg:w-[19rem] lg:shrink-0 lg:rounded-none`}
    >
      <div aria-hidden="true" className="hidden h-12 flex-shrink-0 border-b border-ink/10 lg:block" />
      <div className="flex items-baseline justify-between gap-2 border-b border-ink/10 px-3 py-2.5">
        {onClose && <button type="button" aria-label="Close details" onClick={onClose} className="rounded p-1 text-muted lg:hidden">✕</button>}
        <span className="truncate text-[11px] font-semibold text-ink">
          {room && viewMode === 'floor_plan'
            ? 'Selected Room'
            : room && viewMode !== 'zoning' && viewMode !== 'graph'
              ? room.label
              : headerLabel}
        </span>
        {room && viewMode !== 'floor_plan' && viewMode !== 'zoning' && viewMode !== 'graph' && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-light">
            {formatDims(room.size.w, room.size.d)}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {mvpQuality && (
          <div className="mb-3">
            <QualityPanel quality={mvpQuality} />
          </div>
        )}
        {body}
      </div>
      {rooms.length > 0 && onCreateModel && (
        <div className="flex-shrink-0 border-t border-ink/10 p-3">
          <button
            type="button"
            data-testid="create-3d-model"
            onClick={onCreateModel}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-bold text-graphite-950 shadow-[0_4px_16px_-4px_rgba(255,59,31,0.45)] hover:bg-accent-bright"
          >
            Create a 3D model →
          </button>
          <p className="mt-1.5 text-center text-[10px] text-muted-light">
            Continue with walls, openings and furniture.
          </p>
        </div>
      )}
    </aside>
  )
}
