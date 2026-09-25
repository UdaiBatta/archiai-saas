import { useMemo } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import type { ConnectionKind } from '../../types/contracts'
import { EDITOR_PALETTE, ZONE_META, ZONE_ORDER } from './editorPalette'
import type { RoomGraphNode } from './roomGraphModel'
import { useAccessGraph } from './useAccessGraph'

interface RoomGraphViewProps {
  className?: string
}

const NODE_W = 150
const NODE_H = 44
const COL_GAP = 70
const ROW_GAP = 18
const PAD = 40
const HEADER = 34

const NEXT_KIND: Record<ConnectionKind, ConnectionKind> = { wall: 'door', door: 'open', open: 'wall' }
const EDGE_STYLE: Record<ConnectionKind, { stroke: string; width: number; dash?: string; opacity: number }> = {
  door: { stroke: EDITOR_PALETTE.edgeDoor, width: 1.6, opacity: 0.95 },
  open: { stroke: EDITOR_PALETTE.edgeOpen, width: 3.2, opacity: 0.95 },
  wall: { stroke: EDITOR_PALETTE.edgeWall, width: 1, dash: '2 5', opacity: 0.55 },
}

interface PlacedNode extends RoomGraphNode {
  x: number
  y: number
}

/**
 * Justified access graph: the entrance on the left, each column one room
 * deeper. Lines are how rooms meet — door, open, or wall (adjacent, no way
 * through). Click a line to cycle it; the plan, 3D model and this graph all
 * update from the same change.
 */
export function RoomGraphView({ className }: RoomGraphViewProps) {
  const floors = useCanvasStore((s) => s.floors)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  const deselectAll = useCanvasStore((s) => s.deselectAll)
  const setConnection = useCanvasStore((s) => s.setConnection)

  const activeLevel =
    selectedFloor === 'all' ? Math.min(0, ...floors.map((floor) => floor.level)) : selectedFloor
  const graph = useAccessGraph(activeLevel)

  const { columns, placed, width, height } = useMemo(() => {
    const maxDepth = Math.max(0, ...graph.nodes.map((node) => node.depth ?? 0))
    const unreachable = graph.hasConnectionData && graph.nodes.some((node) => node.depth === null)
    const columnCount = maxDepth + 1 + (unreachable ? 1 : 0)
    const byColumn: RoomGraphNode[][] = Array.from({ length: columnCount }, () => [])
    for (const node of graph.nodes) {
      byColumn[node.depth ?? (unreachable ? columnCount - 1 : 0)].push(node)
    }
    const zoneRank = (node: RoomGraphNode) => ZONE_ORDER.indexOf(node.zone)
    const index = new Map<string, PlacedNode>()
    byColumn.forEach((column, c) => {
      column
        .sort((a, b) => zoneRank(a) - zoneRank(b) || a.label.localeCompare(b.label))
        .forEach((node, r) => {
          index.set(node.id, {
            ...node,
            x: PAD + c * (NODE_W + COL_GAP),
            y: PAD + HEADER + r * (NODE_H + ROW_GAP),
          })
        })
    })
    const tallest = Math.max(1, ...byColumn.map((column) => column.length))
    return {
      columns: byColumn.map((column, c) => ({
        label: !graph.hasConnectionData
          ? 'Checking'
          : unreachable && c === columnCount - 1
            ? 'Unreachable'
            : c === 0
              ? 'Entrance'
              : `Depth ${c}`,
        x: PAD + c * (NODE_W + COL_GAP),
        empty: column.length === 0,
      })),
      placed: index,
      width: PAD * 2 + columnCount * NODE_W + (columnCount - 1) * COL_GAP,
      height: PAD * 2 + HEADER + tallest * (NODE_H + ROW_GAP),
    }
  }, [graph.hasConnectionData, graph.nodes])

  const labelOf = (id: string) => placed.get(id)?.label ?? id
  const route = selectedId ? graph.routes.get(selectedId) : undefined
  const routeEdges = new Set(
    (route ?? []).slice(1).map((id, i) => [route![i], id].sort().join('|')),
  )
  const warnings = graph.findings.filter((finding) => finding.severity === 'warn')

  return (
    <div className={`relative overflow-hidden bg-graphite-900 ${className ?? ''}`}>
      {/* Clear the top bar + view switcher (top-28) and the reasoning panel
          on the right, so no node or column header hides under the chrome. */}
      <div className="h-full w-full overflow-auto pb-12 pt-28 sm:pr-80" data-testid="room-graph-canvas">
        <svg
          role="application"
          aria-label="Room access graph"
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          // Never draw bigger than 1:1: a small graph would otherwise be
          // blown up to the full width (nodes several times their size).
          style={{ maxWidth: width }}
          className="mx-auto block select-none"
          onPointerDown={(event) => {
            if (event.button === 0) deselectAll()
          }}
        >
          {columns.map((column) => (
            <text
              key={column.label}
              x={column.x}
              y={PAD + 12}
              fontSize={11}
              fontWeight={700}
              fill={column.label === 'Unreachable' ? EDITOR_PALETTE.invalid : EDITOR_PALETTE.dimension}
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {column.label}
            </text>
          ))}

          {graph.edges.map((edge) => {
            const from = placed.get(edge.source)
            const to = placed.get(edge.target)
            if (!from || !to) return null
            const [x1, y1] = [from.x + NODE_W / 2, from.y + NODE_H / 2]
            const [x2, y2] = [to.x + NODE_W / 2, to.y + NODE_H / 2]
            const midX = (x1 + x2) / 2
            const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
            const style = EDGE_STYLE[edge.kind]
            const onRoute = routeEdges.has([edge.source, edge.target].sort().join('|'))
            const faded = selectedId !== null && !onRoute && edge.source !== selectedId && edge.target !== selectedId
            const next = NEXT_KIND[edge.kind]
            return (
              <g key={`${edge.source}-${edge.target}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={onRoute ? '#FFFFFF' : style.stroke}
                  strokeWidth={onRoute ? style.width + 1 : style.width}
                  strokeDasharray={style.dash}
                  opacity={faded ? 0.25 : style.opacity}
                  pointerEvents="none"
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  role="button"
                  tabIndex={0}
                  aria-label={`${labelOf(edge.source)} to ${labelOf(edge.target)}: ${edge.kind}. Change to ${next}`}
                  data-testid={`graph-edge-${edge.source}-${edge.target}`}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    if (event.button === 0) setConnection(edge.source, edge.target, next)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setConnection(edge.source, edge.target, next)
                    }
                  }}
                >
                  <title>{`${labelOf(edge.source)} ↔ ${labelOf(edge.target)}: ${edge.kind} (click for ${next})`}</title>
                </path>
              </g>
            )
          })}

          {[...placed.values()].map((node) => {
            const selected = node.id === selectedId
            const flagged = warnings.some((finding) => finding.roomId === node.id)
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${node.label}, ${ZONE_META[node.zone].label} zone, ${!graph.hasConnectionData ? 'checking connections' : node.depth === null ? 'unreachable' : `depth ${node.depth}`}`}
                data-testid={`graph-node-${node.id}`}
                transform={`translate(${node.x} ${node.y})`}
                style={{ cursor: 'pointer' }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  if (event.button === 0) selectRoom(node.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectRoom(node.id)
                  }
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={9}
                  fill={selected ? '#F5F5F6' : '#2B2B2C'}
                  stroke={flagged ? EDITOR_PALETTE.warning : selected ? '#FFFFFF' : ZONE_META[node.zone].color}
                  strokeWidth={selected || flagged ? 2 : 1.2}
                />
                <circle cx={16} cy={NODE_H / 2} r={4.5} fill={ZONE_META[node.zone].color} />
                <text x={30} y={NODE_H / 2 - 3} fontSize={11.5} fontWeight={600} fill={selected ? '#1B1B1C' : '#F5F5F6'}>
                  {node.label.length > 17 ? `${node.label.slice(0, 16)}…` : node.label}
                </text>
                <text x={30} y={NODE_H / 2 + 11} fontSize={9.5} fill={selected ? '#464648' : '#909094'}>
                  {ZONE_META[node.zone].label} · {node.areaSqm.toFixed(0)} m²
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <aside
        aria-label="Access reasoning"
        className="absolute right-3 top-28 z-10 max-h-[55%] w-[min(19rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-ink/10 bg-graphite-800/95 p-3 text-xs shadow-xl backdrop-blur"
      >
        <h2 className="mb-2 text-[11px] font-semibold text-ink">Access reasoning</h2>
        {route && route.length > 0 && (
          <p className="mb-2 text-muted" data-testid="graph-route">
            <span className="font-semibold text-ink">Route: </span>
            {route.map(labelOf).join(' → ')}
          </p>
        )}
        {graph.hasConnectionData && selectedId && !route && placed.has(selectedId) && (
          <p className="mb-2 text-danger">{labelOf(selectedId)} has no route from the entrance.</p>
        )}
        {!graph.hasConnectionData ? (
          <p className="text-muted">Checking how the rooms connect…</p>
        ) : graph.findings.length === 0 ? (
          <p className="text-ok">Every room is reachable, and none only through a bedroom.</p>
        ) : (
          <ul className="space-y-1.5">
            {graph.findings.map((finding, i) => (
              <li key={i} className={finding.severity === 'warn' ? 'text-warn' : 'text-muted'}>
                <button type="button" className="text-left hover:underline" onClick={() => selectRoom(finding.roomId)}>
                  {finding.message}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="pointer-events-none absolute bottom-10 left-16 z-10 flex items-center gap-4 rounded-lg border border-ink/10 bg-graphite-800/95 px-3 py-2 text-[10px] text-muted backdrop-blur">
        {(['door', 'open', 'wall'] as const).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <svg width="20" height="4" aria-hidden="true">
              <line x1="0" y1="2" x2="20" y2="2" stroke={EDGE_STYLE[kind].stroke} strokeWidth={EDGE_STYLE[kind].width} strokeDasharray={EDGE_STYLE[kind].dash} />
            </svg>
            {kind === 'door' ? 'Door' : kind === 'open' ? 'Open (no wall)' : 'Wall (no way through)'}
          </span>
        ))}
        <span>· click a line to change it</span>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-light">
          Add rooms or generate a layout to see the room graph.
        </div>
      ) : null}
    </div>
  )
}
