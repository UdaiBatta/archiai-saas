import { useCanvasStore, type Room } from '../../store/canvasStore'
import { clampWallDelta, wallRun } from '../../store/wallLines'
import { formatMeters } from '../../utils/format'

const NUDGE = 0.1

/**
 * A selected engine wall stands for its whole wall line: the pieces between
 * different rooms on one straight line act as one wall. It moves by dragging
 * in the view or with these nudges; the rooms on both sides follow.
 */
export function WallLineCard({ wall }: { wall: Room }) {
  const rooms = useCanvasStore((s) => s.rooms)
  const moveWallLine = useCanvasStore((s) => s.moveWallLine)
  const run = wallRun(rooms, wall.id)
  if (!run) return null

  const names = (side: 'min' | 'max') =>
    run.edges.filter((e) => e.side === side).map((e) => rooms.find((r) => r.id === e.id)?.label ?? e.id)
  // A room whose max edge is on the line lies before it (left/up in Top view).
  const before = names('max')
  const after = names('min')
  const [back, forward] = run.axis === 'x' ? ['←', '→'] : ['↑', '↓']
  const nudge = (delta: number) => moveWallLine(wall.id, delta, { commit: true })
  const can = (delta: number) => clampWallDelta(rooms, run, delta) !== 0

  return (
    <section aria-label="Wall line" className="rounded-lg border border-ink/10 bg-graphite-800/60 p-3 text-xs">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold text-ink">Wall line</h3>
        <span className="font-mono text-[11px] text-muted">{formatMeters(run.to - run.from)}</span>
      </div>
      {run.edges.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted-light">No room edge lies on this wall, so there is nothing to move.</p>
      ) : (
        <>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-light">
            {run.wallIds.length > 1 ? `${run.wallIds.length} wall pieces joined into one. ` : ''}
            Drag it in the view, or nudge it; the rooms on both sides resize.
          </p>
          <dl className="mt-2 space-y-1 text-[11px]">
            {before.length > 0 && <div className="flex gap-2"><dt className="w-4 shrink-0 text-muted-light">{back}</dt><dd className="text-muted">{before.join(', ')}</dd></div>}
            {after.length > 0 && <div className="flex gap-2"><dt className="w-4 shrink-0 text-muted-light">{forward}</dt><dd className="text-muted">{after.join(', ')}</dd></div>}
          </dl>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button type="button" disabled={!can(-NUDGE)} onClick={() => nudge(-NUDGE)} className="rounded-md border border-ink/10 px-2 py-1.5 text-[11px] text-ink hover:bg-ink/5 disabled:opacity-40">
              {back} Move 10 cm
            </button>
            <button type="button" disabled={!can(NUDGE)} onClick={() => nudge(NUDGE)} className="rounded-md border border-ink/10 px-2 py-1.5 text-[11px] text-ink hover:bg-ink/5 disabled:opacity-40">
              Move 10 cm {forward}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
