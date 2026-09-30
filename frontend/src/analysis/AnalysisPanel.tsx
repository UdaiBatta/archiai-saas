import { DOCK_CARD } from '../components/canvas/EditorDock'
import { PALETTE, useSunAnalysis, useSunResultStale } from './sunAnalysis'
import { useSunContext } from './sunStore'

const pct = (v: number) => `${Math.round(v * 100)}%`
const fmtHours = (h: number) => `${h.toFixed(h % 1 ? 2 : 0).replace(/0$/, '')} h`
const button =
  'rounded-md bg-accent px-3 py-1 text-[11px] font-semibold text-graphite-950 transition-colors hover:bg-accent-bright disabled:opacity-50'

/** The Analysis dock popover: sun hours on the ground, façades and habitable-room windows. */
export function AnalysisPanel() {
  const where = useSunContext()
  const { show, running, progress, result, error, setShow, run } = useSunAnalysis()
  const stale = useSunResultStale()
  const date = new Date(`${where.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const summary = result?.summary

  return (
    <div className={`${DOCK_CARD} w-72`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink">Sun hours</span>
        <label className="flex items-center gap-1.5">
          <span>Show</span>
          <input type="checkbox" role="switch" aria-label="Show sun hours" aria-checked={show} checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-accent" />
        </label>
      </div>
      <span className="text-muted-light">
        Direct sun on {date} at {where.lat.toFixed(1)}°, {where.lon.toFixed(1)}°{where.isDefault ? ' (default location, Delhi)' : ''}. Set both in Sun.
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={button} disabled={running} onClick={() => run(where)}>
          {result ? 'Re-run' : 'Run'}
        </button>
        {running && (
          <span role="progressbar" aria-label="Sun analysis progress" aria-valuenow={Math.round(progress * 100)} className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span className="block h-full bg-accent" style={{ width: pct(progress) }} />
          </span>
        )}
        {result && !running && !stale && (
          <span className="text-muted-light">
            {(result.hours.length).toLocaleString()} points × {result.samples} sun positions, {(result.ms / 1000).toFixed(1)} s
          </span>
        )}
      </div>
      {error && <span role="alert" className="text-danger">{error}</span>}
      {result && stale && !running && (
        <span role="status" className="text-warn">Out of date: the model, site, date or location changed. Re-run to update.</span>
      )}
      {summary && !stale && (
        <>
          <div>
            <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${PALETTE.join(', ')})` }} aria-hidden />
            <div className="mt-0.5 flex justify-between text-muted-light">
              <span>0 h</span>
              <span>{fmtHours(summary.maxHours)} (whole day)</span>
            </div>
          </div>
          <span>
            Open ground in sun ≥ 2 h: <span className="font-semibold text-ink">{pct(summary.groundAtLeast2)}</span> · ≥ 4 h:{' '}
            <span className="font-semibold text-ink">{pct(summary.groundAtLeast4)}</span>
          </span>
          {summary.rooms.length > 0 && (
            <div className="border-t border-ink/10 pt-1.5">
              <span className="block font-semibold text-ink">Habitable rooms, direct sun at the window</span>
              <ul className="mt-1 flex flex-col gap-0.5">
                {summary.rooms.map((room) => {
                  const low = room.hours === null || room.hours < 1
                  return (
                    <li key={room.id} className="flex justify-between gap-3">
                      <span className={low ? 'text-warn' : 'text-ink'}>{room.label}</span>
                      <span className={low ? 'text-warn' : ''}>{room.hours === null ? 'no window' : fmtHours(room.hours)}</span>
                    </li>
                  )
                })}
              </ul>
              <span className="mt-1 block text-muted-light">
                Under 1 h is flagged. The daylight rule only checks that these rooms have an outside wall; this is the sun they actually get.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
