import { useMemo, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import type { Mass } from './siteTypes'
import {
  MAX_FLOORS,
  defaultMassFootprint,
  duplicateMass,
  fillEnvelope,
  makeMass,
  massTop,
  siteMetrics,
  zoningIssues,
  type MetricStatus,
  type PlotBounds,
} from './massing'
import { useMassUi, useSiteAndMasses } from './massStore'
import { HousingPanel } from './HousingPanel'

const STATUS_CLASS: Record<MetricStatus, string> = {
  ok: 'text-ok',
  near: 'text-warn',
  over: 'text-danger',
  none: 'text-ink',
}
const STATUS_DOT: Record<MetricStatus, string> = {
  ok: 'bg-ok',
  near: 'bg-warn',
  over: 'bg-danger',
  none: 'bg-ink/20',
}

const m2 = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString()} m²`)
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const fmt: Record<string, (v: number) => string> = {
  coverage: pct,
  far: (v) => v.toFixed(2),
  height: (v) => `${v.toFixed(1)} m`,
}

const btn =
  'rounded-md border border-ink/15 px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/60 disabled:opacity-40'
const field = 'w-full rounded-md border border-ink/15 bg-graphite-900/60 px-1.5 py-1 text-[11px] text-ink'
const input = `${field} text-right font-mono tabular-nums`

/**
 * Massing panel: tools to create masses, live site metrics against the
 * zoning limits, issues with one-click fixes, and the selected mass's inspector.
 */
export function MassingPanel({ readOnly, topView, plot, docked = false }: { readOnly: boolean; topView: boolean; plot: PlotBounds | null; docked?: boolean }) {
  const { site, masses } = useSiteAndMasses()
  const setMasses = useCanvasStore((s) => s.setMasses)
  const { selectedMassId, select, drawMode, setDrawMode } = useMassUi()
  const [open, setOpen] = useState(true)
  const metrics = useMemo(() => siteMetrics(site, masses), [site, masses])
  const issues = useMemo(() => zoningIssues(site, masses), [site, masses])
  const selected = masses.find((m) => m.id === selectedMassId)

  const addMasses = (created: Mass[]) => {
    if (!created.length) return
    setMasses([...masses, ...created])
    select(created[created.length - 1].id)
    useCanvasStore.getState().deselectAll()
  }
  const patch = (id: string, change: Partial<Mass>) => setMasses(masses.map((m) => (m.id === id ? { ...m, ...change } : m)))
  const toggleDraw = (mode: 'rect' | 'poly') => setDrawMode(drawMode === mode ? null : mode)

  return (
    <aside
      aria-label="Massing"
      className={docked
        ? 'flex max-h-[min(60vh,32rem)] w-72 flex-col overflow-hidden rounded-xl border border-ink/10 bg-graphite-800 text-[11px] text-muted shadow-xl'
        : 'absolute right-4 top-28 z-20 flex max-h-[calc(100%-9rem)] w-64 flex-col overflow-hidden rounded-xl border border-ink/10 bg-graphite-800/95 text-[11px] text-muted shadow-lg backdrop-blur'}
    >
      <button type="button" aria-expanded={open} onClick={() => !docked && setOpen(!open)} className="flex items-center justify-between px-3 py-2 font-semibold text-ink">
        <span>Massing{masses.length ? ` · ${masses.length}` : ''}</span>
        <span className="flex items-center gap-2">
          {issues.length > 0 && <span className="rounded-full bg-danger/20 px-1.5 text-danger">{issues.length}</span>}
          {!docked && <span aria-hidden>{open ? '▾' : '▸'}</span>}
        </span>
      </button>
      {(open || docked) && (
        <div className="flex flex-col gap-3 overflow-y-auto px-3 pb-3">
          {!readOnly && (
            <div className="flex flex-wrap gap-1">
              <button type="button" className={btn} onClick={() => addMasses([makeMass(masses, defaultMassFootprint(site, plot))])}>
                Add mass
              </button>
              <button type="button" className={btn} disabled={!site} title={site ? undefined : 'Draw a site first'} onClick={() => site && addMasses(fillEnvelope(site, masses))}>
                Fill envelope
              </button>
              <button type="button" className={btn} aria-pressed={drawMode === 'rect'} disabled={!topView} title={topView ? 'Drag a rectangle in Top view' : 'Switch to Top view to draw'} onClick={() => toggleDraw('rect')}>
                {drawMode === 'rect' ? 'Drawing…' : 'Draw rect'}
              </button>
              <button type="button" className={btn} aria-pressed={drawMode === 'poly'} disabled={!topView} title={topView ? 'Click corners; click the first, double-click or Enter to close' : 'Switch to Top view to draw'} onClick={() => toggleDraw('poly')}>
                {drawMode === 'poly' ? 'Drawing…' : 'Draw polygon'}
              </button>
            </div>
          )}

          <dl aria-label="Site metrics" className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 font-mono tabular-nums">
            <dt className="font-sans">Site area</dt><dd className="text-right text-ink">{m2(metrics.siteArea)}</dd>
            <dt className="font-sans">Buildable</dt><dd className="text-right text-ink">{m2(metrics.buildableArea)}</dd>
            <dt className="font-sans">Footprint</dt><dd className="text-right text-ink">{m2(metrics.footprintArea)}</dd>
            <dt className="font-sans">GFA</dt><dd className="text-right text-ink">{m2(metrics.gfa)}</dd>
            <dt className="font-sans">Floors (max)</dt><dd className="text-right text-ink">{metrics.maxFloors}</dd>
          </dl>

          <table aria-label="Zoning limits" className="w-full font-mono tabular-nums">
            <tbody>
              {metrics.rows.map((row) => (
                <tr key={row.key} data-status={row.status}>
                  <td className="py-0.5 font-sans">
                    <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[row.status]}`} />
                    {row.label}
                  </td>
                  <td className={`py-0.5 text-right font-semibold ${STATUS_CLASS[row.status]}`}>{fmt[row.key](row.value)}</td>
                  <td className="py-0.5 pl-1 text-right text-muted-light">{row.limit === null ? 'no limit' : `/ ${fmt[row.key](row.limit)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!site && <p className="text-muted-light">No site yet: coverage and FAR need a site boundary.</p>}

          {issues.length > 0 && (
            <ul aria-label="Zoning issues" className="flex flex-col gap-1.5">
              {issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.massId}-${i}`} className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1.5">
                  <button type="button" className="text-left text-ink" onClick={() => issue.massId && select(issue.massId)}>
                    {issue.message}
                  </button>
                  {issue.fix && !readOnly && (
                    <button type="button" className={`${btn} mt-1 block`} onClick={() => setMasses(issue.fix!.masses)}>
                      Fix: {issue.fix.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <section aria-label="Mass inspector" className="flex flex-col gap-1.5 border-t border-ink/10 pt-2">
              <input
                key={`${selected.id}:${selected.name}`}
                aria-label="Mass name"
                className={`${field} font-semibold`}
                defaultValue={selected.name}
                disabled={readOnly}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== selected.name) patch(selected.id, { name })
                }}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <NumberField label="Floors" value={selected.floors} min={1} max={MAX_FLOORS} step={1} disabled={readOnly} onChange={(v) => patch(selected.id, { floors: Math.round(v) })} />
                <NumberField label="Floor h (m)" value={selected.floorHeightM} min={2} max={10} step={0.1} disabled={readOnly} onChange={(v) => patch(selected.id, { floorHeightM: v })} />
                <NumberField label="Base (m)" value={selected.baseM} min={0} max={500} step={0.5} disabled={readOnly} onChange={(v) => patch(selected.id, { baseM: v })} />
              </div>
              <div className="font-mono tabular-nums text-muted-light">Top {massTop(selected).toFixed(1)} m</div>
              {!readOnly && (
                <div className="flex gap-1">
                  <button type="button" className={btn} onClick={() => addMasses([duplicateMass(masses, selected)])}>Duplicate</button>
                  <button
                    type="button"
                    className={`${btn} hover:border-danger/60 hover:text-danger`}
                    onClick={() => {
                      useCanvasStore.getState().deleteMass(selected.id)
                      select(null)
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
              <HousingPanel key={selected.id} mass={selected} readOnly={readOnly} />
            </section>
          )}
        </div>
      )}
    </aside>
  )
}

function NumberField({ label, value, min, max, step, disabled, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-muted-light">{label}</span>
      {/* Uncontrolled: typing and arrow ticks are free; blur or Enter commits one undo step. */}
      <input
        key={value}
        type="number"
        className={input}
        defaultValue={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        onBlur={(e) => {
          const v = e.target.valueAsNumber
          const next = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value
          if (next !== value) onChange(next)
          else e.target.value = String(Number(value.toFixed(2)))
        }}
      />
    </label>
  )
}
