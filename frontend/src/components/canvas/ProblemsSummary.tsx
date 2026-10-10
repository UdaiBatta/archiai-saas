import type { Violation } from '../../types/contracts'
import { useCanvasStore } from '../../store/canvasStore'
import { violationHelp } from './violationHelp'

const SHOWN = 3

/** The plan's hard problems, in plain words, where the user is already looking. */
export function ProblemsSummary({ violations }: { violations: Violation[] }) {
  const rooms = useCanvasStore((s) => s.rooms)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  if (violations.length === 0) return null
  const labelOf = (id: string) => rooms.find((room) => room.id === id)?.label ?? 'A room'

  return (
    <section aria-label="Problems to fix" className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5">
      <h3 className="text-xs font-semibold text-danger">
        {violations.length} {violations.length === 1 ? 'problem' : 'problems'} to fix
      </h3>
      <ul className="mt-1.5 space-y-1">
        {violations.slice(0, SHOWN).map((violation, index) => {
          const roomId = violation.room_ids[0]
          const who = violation.room_ids.map(labelOf).join(', ')
          return (
            <li key={`${violation.code}-${index}`}>
              <button
                type="button"
                disabled={!roomId}
                onClick={() => roomId && selectRoom(roomId)}
                className="w-full rounded-md px-1 py-0.5 text-left text-[11px] leading-relaxed text-muted enabled:hover:bg-ink/5 enabled:hover:text-ink"
              >
                {who && <span className="font-semibold text-ink">{who}: </span>}
                {violationHelp(violation.code).fix}
              </button>
            </li>
          )
        })}
      </ul>
      {violations.length > SHOWN && (
        <p className="mt-1 text-[10.5px] text-muted-light">+{violations.length - SHOWN} more in Layout checks</p>
      )}
    </section>
  )
}
