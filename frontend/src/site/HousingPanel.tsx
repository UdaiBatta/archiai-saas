import { useEffect, useRef, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { fillHousing } from '../services/housing.service'
import { getApiErrorMessage } from '../services/apiError'
import { UNIT_TYPES, type MassHousing, type UnitType } from './housingTypes'
import {
  DEFAULT_CORRIDOR_M,
  UNIT_LABELS,
  buildFillRequest,
  facingFrom,
  isHousingStale,
  lockedUnits,
  mixPct,
  mixRows,
  mixTotal,
  toggleUnitLock,
  type DriftStatus,
} from './housing'
import { useHousing, useHousingUi } from './massStore'
import type { Mass } from './siteTypes'

/** Auto re-solve waits this long after the last edit of the mass. */
export const AUTO_RESOLVE_MS = 600

const btn =
  'rounded-md border border-ink/15 px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/60 disabled:opacity-40'
const num = 'w-14 rounded-md border border-ink/15 bg-graphite-900/60 px-1.5 py-0.5 text-right font-mono text-[11px] tabular-nums text-ink'
const DRIFT_TEXT: Record<DriftStatus, string> = { ok: 'text-ok', near: 'text-warn', over: 'text-danger' }
const DRIFT_BAR: Record<DriftStatus, string> = { ok: 'bg-ok', near: 'bg-warn', over: 'bg-danger' }
const pct = (v: number) => `${(v * 100).toFixed(0)}%`
const m2 = (v: number) => `${Math.round(v).toLocaleString()} m²`

/** The mass inspector's Housing section: mix, corridor, fill / re-solve, yield, the picked unit. */
export function HousingPanel({ mass, readOnly }: { mass: Mass; readOnly: boolean }) {
  const housing = useHousing()[mass.id] as MassHousing | undefined
  const setHousing = useCanvasStore((s) => s.setHousing)
  const { floor, setFloor, unitId, autoResolve, setAutoResolve } = useHousingUi()
  const [mix, setMix] = useState(() => mixPct(housing?.request.mix))
  const [corridor, setCorridor] = useState(housing?.request.corridor_width_m ?? DEFAULT_CORRIDOR_M)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = mixTotal(mix)
  const mixOk = Math.abs(total - 100) < 1e-6
  const stale = housing ? isHousingStale(housing, mass) : false

  const fill = async () => {
    const request = buildFillRequest(mass, {
      mixPct: mix,
      corridorM: corridor,
      facing: facingFrom(useCanvasStore.getState().layoutMetadata),
      locked: housing ? lockedUnits(housing) : [],
    })
    setBusy(true)
    setError(null)
    try {
      const result = await fillHousing(request)
      setHousing(mass.id, { request, result })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not fill the mass with housing.'))
    } finally {
      setBusy(false)
    }
  }
  const fillRef = useRef(fill)
  fillRef.current = fill

  // Auto re-solve: debounced after the last change to the mass's shape.
  useEffect(() => {
    if (!autoResolve || !stale || readOnly || !mixOk) return
    const timer = window.setTimeout(() => void fillRef.current(), AUTO_RESOLVE_MS)
    return () => window.clearTimeout(timer)
  }, [autoResolve, stale, readOnly, mixOk, mass.footprint, mass.floors, mass.floorHeightM])

  const unit = housing?.result.units.find((u) => u.id === unitId)
  const floors = housing ? Math.min(housing.request.floors, mass.floors) : 0

  return (
    <section aria-label="Housing" className="flex flex-col gap-1.5 border-t border-ink/10 pt-2">
      <div className="flex items-center justify-between font-semibold text-ink">
        <span>Housing</span>
        {stale && <span role="status" className="rounded-full bg-warn/20 px-1.5 text-[10px] text-warn">Out of date</span>}
      </div>

      <table aria-label="Unit mix" className="w-full">
        <tbody>
          {UNIT_TYPES.map((t) => (
            <tr key={t}>
              <td className="py-0.5">{UNIT_LABELS[t]}</td>
              <td className="w-full px-1.5">
                <input
                  type="range" min={0} max={100} step={5} value={mix[t]} disabled={readOnly} aria-hidden tabIndex={-1}
                  className="w-full accent-accent"
                  onChange={(e) => setMix({ ...mix, [t]: e.target.valueAsNumber })}
                />
              </td>
              <td>
                <input
                  type="number" aria-label={`${UNIT_LABELS[t]} %`} min={0} max={100} step={1} value={mix[t]} disabled={readOnly} className={num}
                  onChange={(e) => setMix({ ...mix, [t]: Math.max(0, Math.min(100, e.target.valueAsNumber || 0)) })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`font-mono tabular-nums ${mixOk ? 'text-muted-light' : 'text-danger'}`} role={mixOk ? undefined : 'alert'}>
        Total {total}%{mixOk ? '' : ` — must be 100% (${total > 100 ? 'remove' : 'add'} ${Math.abs(100 - total)})`}
      </div>

      <label className="flex items-center justify-between gap-2">
        <span className="text-muted-light">Corridor (m)</span>
        <input
          type="number" aria-label="Corridor width" min={1.2} max={3} step={0.1} value={corridor} disabled={readOnly} className={num}
          onChange={(e) => setCorridor(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : DEFAULT_CORRIDOR_M)}
        />
      </label>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={btn} disabled={busy || !mixOk || corridor < 1.2 || corridor > 3} onClick={() => void fill()}>
            {busy ? 'Filling…' : housing ? (stale ? 'Re-solve' : 'Fill again') : 'Fill with housing'}
          </button>
          {housing && (
            <button type="button" className={btn} disabled={busy} onClick={() => setHousing(mass.id, null)}>Clear</button>
          )}
          {housing && (
            <label className="ml-auto flex items-center gap-1 text-muted-light">
              <input type="checkbox" checked={autoResolve} onChange={(e) => setAutoResolve(e.target.checked)} />
              Auto re-solve
            </label>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-danger">{error}</p>}

      {housing && (
        <>
          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-light">Show floor</span>
            <select
              aria-label="Housing floor" className="rounded-md border border-ink/15 bg-graphite-900/60 px-1.5 py-0.5 text-[11px] text-ink"
              value={String(floor)} onChange={(e) => setFloor(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">All floors</option>
              {Array.from({ length: floors }, (_, f) => <option key={f} value={f}>{f === 0 ? 'Ground' : `Floor ${f}`}</option>)}
            </select>
          </label>
          {unit && (
            <div aria-label="Selected unit" className="flex items-center gap-2 rounded-md border border-ink/10 bg-graphite-900/40 px-2 py-1.5">
              <div className="flex-1">
                <div className="font-semibold text-ink">{UNIT_LABELS[unit.unit_type]}</div>
                <div className="font-mono tabular-nums text-muted-light">{unit.area_m2.toFixed(1)} m² · {unit.floor === 0 ? 'Ground' : `Floor ${unit.floor}`}</div>
              </div>
              <button type="button" className={btn} aria-pressed={unit.locked} disabled={readOnly} onClick={() => setHousing(mass.id, toggleUnitLock(housing, unit.id))}>
                {unit.locked ? 'Locked' : 'Lock'}
              </button>
            </div>
          )}
          <HousingYield housing={housing} />
        </>
      )}
    </section>
  )
}

/** Yield: units, mix achieved vs target, areas and efficiency, server warnings. */
export function HousingYield({ housing }: { housing: MassHousing }) {
  const y = housing.result.yield
  const rows = mixRows(housing)
  const locks = lockedUnits(housing).length
  return (
    <div aria-label="Yield" className="flex flex-col gap-1.5">
      <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 font-mono tabular-nums">
        <dt className="font-sans">Units</dt><dd className="text-right font-semibold text-ink">{y.total_units}</dd>
        <dt className="font-sans">NSA</dt><dd className="text-right text-ink">{m2(y.nsa_m2)}</dd>
        <dt className="font-sans">GFA</dt><dd className="text-right text-ink">{m2(y.gfa_m2)}</dd>
        <dt className="font-sans">Efficiency</dt><dd className="text-right text-ink">{(y.efficiency * 100).toFixed(1)}%</dd>
        {locks > 0 && <><dt className="font-sans">Locked</dt><dd className="text-right text-ink">{locks}</dd></>}
      </dl>
      <table aria-label="Mix achieved" className="w-full font-mono tabular-nums">
        <tbody>
          {rows.map((r) => (
            <tr key={r.type} data-status={r.status}>
              <td className="py-0.5 font-sans">{UNIT_LABELS[r.type as UnitType]}</td>
              <td className="py-0.5 text-right text-ink">{r.count}</td>
              <td className="w-full px-1.5 py-0.5">
                <div className="relative h-1.5 rounded-full bg-ink/10" title={`Target ${pct(r.target)}`}>
                  <div className={`absolute inset-y-0 left-0 rounded-full ${DRIFT_BAR[r.status]}`} style={{ width: `${Math.min(100, r.achieved * 100)}%` }} />
                  <div className="absolute -inset-y-0.5 w-px bg-ink" style={{ left: `${Math.min(100, r.target * 100)}%` }} />
                </div>
              </td>
              <td className={`py-0.5 text-right font-semibold ${DRIFT_TEXT[r.status]}`}>{pct(r.achieved)}</td>
              <td className="whitespace-nowrap py-0.5 pl-1 text-right text-muted-light">/ {pct(r.target)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {housing.result.warnings.length > 0 && (
        <ul aria-label="Housing warnings" className="flex flex-col gap-1">
          {housing.result.warnings.map((w, i) => (
            <li key={i} className="rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-ink">{w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
