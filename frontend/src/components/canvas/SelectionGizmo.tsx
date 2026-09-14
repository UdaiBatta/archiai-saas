import { useCanvasStore } from '../../store/canvasStore'
import { displayRoomColor } from './editorPalette'
import { formatArea, formatDims } from '../../utils/format'
import { canonicalQuarterTurn } from '../../utils/quarterTurn'

/**
 * A floating top-center pill shown when a room is selected — type, color
 * dot, area, and quick actions (Duplicate/Rotate/Delete/Deselect).
 * Inspector stays for precise numeric editing; this is the fast path,
 * matching the spec's "selection-gizmo actions" mapping for the controls
 * that used to live in the deleted EditorToolbar.
 */
export function SelectionGizmo() {
  const selectedId = useCanvasStore((s) => s.selectedId)
  const rooms = useCanvasStore((s) => s.rooms)
  const updateRoom = useCanvasStore((s) => s.updateRoom)
  const duplicateRoom = useCanvasStore((s) => s.duplicateRoom)
  const deleteRoom = useCanvasStore((s) => s.deleteRoom)
  const deselectAll = useCanvasStore((s) => s.deselectAll)

  const room = rooms.find((r) => r.id === selectedId) ?? null
  if (!room) return null

  const area = room.size.w * room.size.d

  const rotate90 = () => {
    const nextY = canonicalQuarterTurn(room.rotation.y + 90)
    updateRoom(
      room.id,
      { rotation: { x: 0, y: nextY, z: 0 } },
      { action: 'object.rotated', previousValue: room.rotation }
    )
  }

  return (
    <div className="absolute left-1/2 top-28 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-ink/15 bg-graphite-800/95 px-3 py-2 shadow-sm backdrop-blur">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: displayRoomColor(room) }}
      />
      <span className="max-w-28 truncate text-xs font-semibold text-ink">{room.label}</span>
      <span className="hidden whitespace-nowrap font-mono text-xs tabular-nums text-muted lg:inline">
        {formatDims(room.size.w, room.size.d)} · {formatArea(area)}
      </span>
      <span className="h-4 w-px bg-ink/10" />
      <button
        type="button"
        aria-label="Duplicate"
        title="Duplicate"
        onClick={() => duplicateRoom(room.id)}
        className="flex h-6 w-6 items-center justify-center rounded-lg text-ink/60 hover:bg-ink/5 hover:text-ink"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="1.5" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Rotate 90 degrees"
        title="Rotate 90°"
        onClick={rotate90}
        className="flex h-6 w-6 items-center justify-center rounded-lg text-ink/60 hover:bg-ink/5 hover:text-ink"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6M3 22v-6h6" />
          <path d="M21 8a9 9 0 0 0-15-3.5L3 8m0 8a9 9 0 0 0 15 3.5l3-3.5" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        onClick={() => deleteRoom(room.id)}
        className="flex h-6 w-6 items-center justify-center rounded-lg text-danger hover:bg-danger/10"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6h12z" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Deselect"
        title="Deselect"
        onClick={deselectAll}
        className="flex h-6 w-6 items-center justify-center rounded-lg bg-ink/5 text-ink/60 hover:bg-ink/10"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
