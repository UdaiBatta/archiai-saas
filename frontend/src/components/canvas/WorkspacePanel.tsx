import { useMemo, useState, useDeferredValue } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { InspectorProperties } from './Inspector'
import { RoomConnections } from './RoomConnections'
import { QualityPanel } from './QualityPanel'
import { ProblemsSummary } from './ProblemsSummary'
import { dragToPlace } from './PlacementGhost'
import { parseMvpQuality } from './qualityModel'
import { ZONE_META, ZONE_ORDER, displayRoomColor } from './editorPalette'
import { zoneForRoom } from './zoneModel'
import { roomPlanArea as planArea } from './topViewModel'
import { formatArea } from '../../utils/format'
import { furnishRooms } from '../../services/furnish.service'
import { getApiErrorMessage } from '../../services/apiError'

interface WorkspacePanelProps {
  modelStage: boolean
  reviewChanges: boolean
  onReviewChanges: (value: boolean) => void
  onCreateModel: () => void
  open: boolean
  onClose: () => void
  busy: boolean
}

export function WorkspacePanel({ modelStage, reviewChanges, onReviewChanges, onCreateModel, open, onClose, busy }: WorkspacePanelProps) {
  const [search, setSearch] = useState('')
  const [furnishing, setFurnishing] = useState(false)
  const [furnishNotes, setFurnishNotes] = useState<string[] | null>(null)
  const furnish = async () => {
    setFurnishing(true)
    try {
      setFurnishNotes(await furnishRooms())
    } catch (error) {
      setFurnishNotes([getApiErrorMessage(error, 'Could not furnish the rooms.')])
    } finally {
      setFurnishing(false)
    }
  }
  // Low priority: the list must not hold up the canvas while a room is dragged.
  const rooms = useDeferredValue(useCanvasStore((s) => s.rooms))
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  const deselectAll = useCanvasStore((s) => s.deselectAll)
  const activityLog = useCanvasStore((s) => s.activityLog)
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)
  const placementMode = useCanvasStore((s) => s.placementMode)
  const setPlacementMode = useCanvasStore((s) => s.setPlacementMode)
  const quality = useMemo(() => parseMvpQuality(layoutMetadata), [layoutMetadata])
  const selected = rooms.find((room) => room.id === selectedId)
  const spaces = rooms.filter((room) => COMPONENT_REGISTRY[room.objectType].category === 'space' && (selectedFloor === 'all' || (room.floorLevel ?? 0) === selectedFloor))
  const listed = modelStage ? rooms.filter((room) => room.objectType === 'furniture' && (selectedFloor === 'all' || (room.floorLevel ?? 0) === selectedFloor)) : spaces
  const visible = listed.filter((room) => room.label.toLowerCase().includes(search.toLowerCase()))
  const totalArea = spaces.reduce((sum, room) => sum + planArea(room), 0)
  // Area by zone for the header bar, and the list grouped the same way.
  const zones = ZONE_ORDER.map((id) => ({ id, area: spaces.filter((room) => zoneForRoom(room) === id).reduce((sum, room) => sum + planArea(room), 0) })).filter((zone) => zone.area > 0)
  const groups = ZONE_ORDER.map((id) => ({ id, rooms: visible.filter((room) => zoneForRoom(room) === id) })).filter((group) => group.rooms.length)

  return (
    <aside aria-label="Workspace details" className={`${open ? 'flex' : 'hidden lg:flex'} absolute bottom-36 right-3 top-28 z-30 w-[min(19rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-ink/10 bg-[#1c1d1e]/95 backdrop-blur lg:static lg:w-[19rem] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-r-0`}>
      {/* Clears the editor top bar, like the zoning / graph panel. */}
      <div aria-hidden="true" className="hidden h-12 flex-shrink-0 lg:block" />
      <div className="border-b border-ink/10 px-4 pb-3 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{reviewChanges ? 'Review your changes' : modelStage ? 'Model & furniture' : 'Program'}</h2>
          <button type="button" aria-label="Close details" onClick={onClose} className="rounded p-1 text-muted lg:hidden">✕</button>
          {quality && !reviewChanges && (
            <span className="hidden font-mono text-[10px] text-muted lg:block" title="Layout quality score">
              Quality <span className={quality.score >= 90 ? 'text-ok' : quality.score >= 70 ? 'text-warn' : 'text-danger'}>{quality.score}</span>
            </span>
          )}
        </div>
        {!reviewChanges && !modelStage && (
          <>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-2xl leading-none text-ink">{formatArea(totalArea)}</span>
              <span className="text-[11px] text-muted">{spaces.length} {spaces.length === 1 ? 'space' : 'spaces'}</span>
            </p>
            {totalArea > 0 && (
              <div className="mt-3" aria-label="Area by zone">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-ink/5">
                  {zones.map((zone) => (
                    <span key={zone.id} style={{ width: `${(zone.area / totalArea) * 100}%`, backgroundColor: ZONE_META[zone.id].color }} />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
                  {zones.map((zone) => (
                    <li key={zone.id} className="flex items-center gap-1.5">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ZONE_META[zone.id].color }} />
                      {ZONE_META[zone.id].label} <span className="font-mono text-muted-light">{Math.round((zone.area / totalArea) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!reviewChanges && quality && <ProblemsSummary violations={quality.hard_violations} />}
        {reviewChanges ? (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted">Review your edits made this session.</p>
            {activityLog.length ? (
              <ol className="space-y-2" aria-label="Session changes">
                {activityLog.map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-ink/10 bg-ink/[0.025] px-3 py-2 text-xs text-ink">
                    <span className="capitalize text-muted">{entry.action.replace('object.', '')}</span> {entry.objectLabel}
                    <time className="mt-1 block text-[10px] text-muted-light">{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </li>
                ))}
              </ol>
            ) : <p className="rounded-lg bg-ink/5 p-3 text-xs text-muted">No manual changes in this session yet.</p>}
            <button type="button" onClick={() => onReviewChanges(false)} className="mt-2 w-full py-2 text-xs text-muted">Back to rooms</button>
          </>
        ) : selected ? (
          <>
            <button type="button" onClick={deselectAll} className="mb-3 text-xs text-muted hover:text-ink">← {modelStage ? 'Model overview' : 'All rooms'}</button>
            <h3 className="mb-3 truncate text-sm font-semibold text-ink">{selected.label}</h3>
            <fieldset disabled={busy} className="min-w-0"><InspectorProperties room={selected} /></fieldset>
            {selected.objectType === 'room' && <RoomConnections roomId={selected.id} disabled={busy} />}
            {Array.isArray(selected.separates) && selected.separates.length === 2 && (
              <RoomConnections roomId={selected.separates[0] as string} onlyWith={selected.separates[1] as string} disabled={busy} />
            )}
          </>
        ) : (
          <>
            {modelStage && <p className="mb-3 text-xs leading-relaxed text-muted">Your layout, with walls and openings. Place furniture proxies to explore the space.</p>}
            <input aria-label={modelStage ? 'Search furniture' : 'Search rooms'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={modelStage ? 'Search furniture…' : 'Search rooms…'} className="mb-1 w-full rounded-lg border border-ink/10 bg-graphite-900/70 px-3 py-1.5 text-xs text-ink outline-none placeholder:text-muted-light focus:border-accent" />
            {(modelStage ? [{ id: null, rooms: visible }] : groups).map((group) => (
              <section key={group.id ?? 'all'} className="mt-2">
                {group.id && (
                  <h3 className="flex items-center justify-between px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-light">
                    {ZONE_META[group.id].label}
                    <span className="font-mono font-normal normal-case tracking-normal">{formatArea(group.rooms.reduce((sum, room) => sum + planArea(room), 0))}</span>
                  </h3>
                )}
                <ul>
                  {group.rooms.map((room) => (
                    <li key={room.id}>
                      <button type="button" onClick={() => selectRoom(room.id)} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none">
                        <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px]" style={{ backgroundColor: displayRoomColor(room) }} />
                        <span className="min-w-0 flex-1 truncate text-xs text-ink/90 group-hover:text-ink">{room.label}</span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">{formatArea(planArea(room))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!visible.length && <p className="px-2 py-4 text-xs text-muted-light">{listed.length ? 'No matching items.' : modelStage ? 'No furniture placed yet.' : 'No rooms on this level yet.'}</p>}
            {!modelStage && <button type="button" disabled={busy} onClick={() => setPlacementMode(placementMode === 'room' ? null : 'room')} {...dragToPlace('room')} title="Click, then click on the plot, or drag onto the plot" className="mt-3 w-full rounded-lg border border-dashed border-ink/15 px-3 py-2 text-xs text-muted transition-colors hover:border-ink/30 hover:text-ink">{placementMode === 'room' ? 'Cancel room placement' : '+ Add a room'}</button>}
          </>
        )}
        {quality && <details open={quality.hard_violations.length > 0 || undefined} className="mt-4 border-t border-ink/10 pt-3"><summary className="cursor-pointer text-xs text-muted">Layout checks</summary><div className="mt-3"><QualityPanel quality={quality} /></div></details>}
      </div>
      <div className="border-t border-ink/10 bg-graphite-900/40 p-3">
        {!modelStage && !reviewChanges && <button type="button" onClick={() => onReviewChanges(true)} className="mb-2 w-full rounded-lg border border-ink/15 px-3 py-2 text-xs text-ink">Review & refine{activityLog.length ? ` · ${activityLog.length}` : ''}</button>}
        {modelStage && furnishNotes && furnishNotes.length > 0 && (
          <div role="status" aria-label="Furnishing warnings" className="mb-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink">
            <div className="mb-1 flex items-center justify-between font-semibold text-warn">
              Not everything fit
              <button type="button" aria-label="Dismiss warnings" onClick={() => setFurnishNotes(null)} className="text-muted hover:text-ink">✕</button>
            </div>
            <ul className="list-disc space-y-0.5 pl-4">
              {furnishNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          {modelStage && (
            <button type="button" disabled={busy || furnishing} onClick={furnish} title="Place beds, sofas, tables, counters and fixtures, checked against clearances and door swings" className="flex-1 rounded-lg border border-ink/15 px-3 py-2.5 text-xs font-semibold text-ink hover:border-ink/30 disabled:opacity-50">
              {furnishing ? 'Furnishing…' : 'Furnish rooms'}
            </button>
          )}
          <button type="button" data-testid="create-3d-model" disabled={busy} onClick={modelStage ? () => setPlacementMode(placementMode === 'furniture' ? null : 'furniture') : onCreateModel} {...(modelStage ? dragToPlace('furniture') : {})} className="flex-1 rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-graphite-950 hover:bg-accent-bright disabled:opacity-50">
            {modelStage ? placementMode === 'furniture' ? 'Cancel placement' : '+ Add furniture' : 'Furniture & details →'}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-light">{modelStage ? placementMode === 'furniture' ? 'Click on a room floor to place a proxy. Esc cancels.' : 'Furnish rooms re-places auto furniture; hand-placed pieces stay' : 'Walls, doors and windows build as you draw. Next: place furniture and check clearances.'}</p>
      </div>
    </aside>
  )
}
