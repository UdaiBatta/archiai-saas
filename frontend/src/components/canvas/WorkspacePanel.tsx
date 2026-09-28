import { useMemo, useState, useDeferredValue } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { InspectorProperties } from './Inspector'
import { RoomConnections } from './RoomConnections'
import { QualityPanel } from './QualityPanel'
import { parseMvpQuality } from './qualityModel'
import { displayRoomColor } from './editorPalette'
import { formatArea } from '../../utils/format'

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

  return (
    <aside aria-label="Workspace details" className={`${open ? 'flex' : 'hidden lg:flex'} absolute bottom-36 right-3 top-28 z-30 w-[min(18rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-ink/10 bg-[#1d1f23]/95 shadow-xl backdrop-blur lg:static lg:my-3 lg:mr-3 lg:mt-14 lg:w-72 lg:shrink-0`}>
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <h2 className="text-xs font-semibold text-ink">{reviewChanges ? 'Review your changes' : modelStage ? 'Model & furniture' : 'Room program'}</h2>
        <button type="button" aria-label="Close details" onClick={onClose} className="rounded p-1 text-muted lg:hidden">✕</button>
        <span className="hidden text-[10px] text-muted-light lg:block">{modelStage ? 'Concept model' : `${spaces.length} spaces`}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
          </>
        ) : (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted">{modelStage ? 'Your layout, with walls and openings. Place furniture proxies to explore the space.' : 'Select a room to edit it. Drag a selected block to move it, or use its corner handles to resize.'}</p>
            <input aria-label={modelStage ? 'Search furniture' : 'Search rooms'} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={modelStage ? 'Search furniture…' : 'Search rooms…'} className="mb-3 w-full rounded-lg border border-ink/10 bg-graphite-900 px-3 py-2 text-xs text-ink outline-none focus:border-accent" />
            <div className="space-y-1">
              {visible.map((room) => (
                <button key={room.id} type="button" onClick={() => selectRoom(room.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-ink/5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: displayRoomColor(room) }} />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{room.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-light">{formatArea(room.size.w * room.size.d)}</span>
                </button>
              ))}
              {!visible.length && <p className="px-2 py-4 text-xs text-muted-light">{listed.length ? 'No matching items.' : modelStage ? 'No furniture placed yet.' : 'No rooms on this level yet.'}</p>}
            </div>
            {!modelStage && <button type="button" disabled={busy} onClick={() => setPlacementMode(placementMode === 'room' ? null : 'room')} className="mt-3 w-full rounded-lg border border-ink/15 px-3 py-2 text-xs text-ink">{placementMode === 'room' ? 'Cancel room placement' : '+ Add a room'}</button>}
            <div className="mt-4 flex justify-between border-t border-ink/10 pt-3 text-[11px]"><span className="text-muted">Room area · active level</span><span className="font-mono text-ink">{formatArea(spaces.reduce((sum, room) => sum + room.size.w * room.size.d, 0))}</span></div>
          </>
        )}
        {quality && <details className="mt-4 border-t border-ink/10 pt-3"><summary className="cursor-pointer text-xs text-muted">Layout checks</summary><div className="mt-3"><QualityPanel quality={quality} /></div></details>}
      </div>
      <div className="border-t border-ink/10 p-3">
        {!modelStage && !reviewChanges && <button type="button" onClick={() => onReviewChanges(true)} className="mb-2 w-full rounded-lg border border-ink/15 px-3 py-2 text-xs text-ink">Review & refine{activityLog.length ? ` · ${activityLog.length}` : ''}</button>}
        <button type="button" data-testid="create-3d-model" disabled={busy} onClick={modelStage ? () => setPlacementMode(placementMode === 'furniture' ? null : 'furniture') : onCreateModel} className="w-full rounded-lg bg-accent px-3 py-2.5 text-xs font-semibold text-graphite-950 hover:bg-accent-bright disabled:opacity-50">
          {modelStage ? placementMode === 'furniture' ? 'Cancel furniture placement' : '+ Add furniture' : 'Create a 3D model →'}
        </button>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-light">{modelStage ? placementMode === 'furniture' ? 'Click on a room floor to place a proxy. Esc cancels.' : 'Generic furniture proxies · a type library comes later' : 'Happy with the layout? Continue to walls & furniture.'}</p>
      </div>
    </aside>
  )
}
