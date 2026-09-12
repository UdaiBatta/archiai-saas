import { useMemo, type ReactNode } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { formatDims } from '../../utils/format'
import { parseProgramValidation } from './programValidationModel'
import { parseMvpQuality } from './qualityModel'

function saveStatusLabel(status: string, lastSavedAt: string | null) {
  if (status === 'saving') return 'Saving...'
  if (status === 'error') return 'Save failed'
  if (status === 'unsaved') return 'Unsaved changes'
  if (lastSavedAt) {
    const time = new Date(lastSavedAt)
    if (!Number.isNaN(time.getTime())) {
      return `Saved ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
  }
  return 'Saved'
}

function Segment({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex h-full items-center border-r border-ink/10 px-4 ${className}`}>
      {children}
    </div>
  )
}

/** Full-width technical status strip for scale, snap, level, validation, units,
 * and persistence. It stays compact but gives every value a stable home. */
export function BottomStatusBar() {
  const rooms = useCanvasStore((s) => s.rooms)
  const floors = useCanvasStore((s) => s.floors)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const snapToGrid = useCanvasStore((s) => s.snapToGrid)
  const setSnapToGrid = useCanvasStore((s) => s.setSnapToGrid)
  const gridSize = useCanvasStore((s) => s.gridSize)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const saveStatus = useCanvasStore((s) => s.saveStatus)
  const lastSavedAt = useCanvasStore((s) => s.lastSavedAt)
  const insights = useCanvasStore((s) => s.generationInsights)
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)
  const validation = useMemo(
    () => parseProgramValidation(layoutMetadata),
    [layoutMetadata],
  )
  const mvpQuality = useMemo(
    () => parseMvpQuality(layoutMetadata),
    [layoutMetadata],
  )

  const activeFloor = selectedFloor === 'all'
    ? null
    : floors.find((floor) => floor.level === selectedFloor) ?? null
  const floorRooms = selectedFloor === 'all'
    ? rooms
    : rooms.filter((room) => (room.floorLevel ?? 0) === selectedFloor)
  const spaceRooms = floorRooms.filter(
    (room) => COMPONENT_REGISTRY[room.objectType].category === 'space',
  )
  const netArea = spaceRooms.reduce((sum, room) => sum + room.size.w * room.size.d, 0)
  const selected = rooms.find((room) => room.id === selectedId) ?? null
  const saveTone = saveStatus === 'error'
    ? 'text-danger'
    : saveStatus === 'unsaved'
      ? 'text-warn'
      : 'text-muted'

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-10 items-center justify-between overflow-hidden border-t border-ink/10 bg-[#18191a]/97 font-mono text-[9px] text-muted backdrop-blur">
      <div className="flex h-full min-w-0 items-center">
        <Segment>
          <span className="mr-1.5 text-muted-light">Scale</span>
          <span className="text-ink">1:100</span>
        </Segment>
        <Segment>
          <button
            type="button"
            onClick={() => setSnapToGrid(!snapToGrid)}
            className="flex items-center gap-1.5 hover:text-ink"
            title="Toggle snap to grid"
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${snapToGrid ? 'bg-accent-bright' : 'bg-muted-light'}`} />
            Snap: <span className="text-ink">{snapToGrid ? 'On' : 'Off'}</span>
          </button>
        </Segment>
        <Segment className="hidden lg:flex">
          Grid <span className="ml-1 text-ink">{gridSize.toFixed(1)} m</span>
        </Segment>
      </div>

      <div className="flex h-full min-w-0 items-center border-l border-ink/10">
        <Segment>
          Floor:
          <span className="ml-1.5 truncate text-ink">
            {selectedFloor === 'all' ? 'All Floors' : activeFloor?.name ?? `Level ${selectedFloor}`}
          </span>
        </Segment>
        {validation ? (
          <Segment className="hidden xl:flex">
            Validation:
            <span className="ml-2 text-ok">{validation.summary.satisfiedCount} satisfied</span>
            <span className="mx-1.5 text-muted-light">/</span>
            <span className="text-warn">{validation.summary.warningCount} warnings</span>
            <span className="mx-1.5 text-muted-light">/</span>
            <span className="text-danger">{validation.summary.failedCount} failed</span>
          </Segment>
        ) : mvpQuality ? (
          <Segment className="hidden xl:flex">
            {mvpQuality.valid ? (
              <>
                Quality <span className="ml-1 text-ink">{mvpQuality.score}/100</span>
              </>
            ) : (
              <span className="text-danger">Invalid layout</span>
            )}
          </Segment>
        ) : insights ? (
          <Segment className="hidden xl:flex">
            Quality <span className="ml-1 text-ink">{insights.score}/100</span>
          </Segment>
        ) : null}
        <Segment className="hidden md:flex">
          {selected
            ? `${selected.label} / ${formatDims(selected.size.w, selected.size.d)}`
            : `${spaceRooms.length} spaces / ${netArea.toFixed(0)} m2`}
        </Segment>
        <Segment>
          Units: <span className="ml-1 text-ink">Meters</span>
        </Segment>
        <div className={`px-4 ${saveTone}`}>
          {saveStatusLabel(saveStatus, lastSavedAt)}
          <span className="sr-only"> / {viewMode}</span>
        </div>
      </div>
    </div>
  )
}
