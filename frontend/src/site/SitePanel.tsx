/**
 * Site panel: create the site (from the plot, by drawing, or by importing
 * GeoJSON / DXF) and edit its zoning rules. Every change is one setSite call,
 * so one undo step.
 */
import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { importSiteDxf } from '../services/site.service'
import { boundaryFromGeoJson } from './geojson'
import { edgeLength, frontEdgeIndex, plotBoundary, streetDirection, withBoundary } from './siteEdit'
import { parseSite, type SitePoint, type SiteRules } from './siteTypes'
import { useSiteUi } from './siteUiStore'

const buttonClass =
  'rounded-md px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent disabled:opacity-40'
const inputClass =
  'w-16 rounded-md border border-ink/10 bg-graphite-900/60 px-1.5 py-0.5 text-right font-mono text-[11px] tabular-nums text-ink focus:border-accent focus:outline-none'

interface NumberFieldProps {
  label: string
  value: number | null
  onCommit: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  onFocus?: () => void
  onBlur?: () => void
}

/** Commits on blur or Enter (one undo step per edit); Escape reverts. */
function NumberField({ label, value, onCommit, min = 0, max, step = 0.5, placeholder = '-', onFocus, onBlur }: NumberFieldProps) {
  const commit = (input: HTMLInputElement) => {
    const text = input.value.trim()
    const parsed = text === '' ? null : Number(text)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < min || (max !== undefined && parsed > max))) {
      input.value = value === null ? '' : String(value)
      return
    }
    if (parsed !== value) onCommit(parsed)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      event.currentTarget.value = value === null ? '' : String(value)
      event.currentTarget.blur()
    }
    event.stopPropagation() // keep editor shortcuts (Delete, arrows) out of the field
  }
  return (
    <input
      key={String(value)}
      type="number"
      inputMode="decimal"
      aria-label={label}
      defaultValue={value === null ? '' : String(value)}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={inputClass}
      onFocus={onFocus}
      onBlur={(event) => {
        commit(event.currentTarget)
        onBlur?.()
      }}
      onKeyDown={onKeyDown}
    />
  )
}

interface SitePanelProps {
  topView: boolean
  onRequestTop: () => void
}

export function SitePanel({ topView, onRequestTop }: SitePanelProps) {
  const raw = useCanvasStore((s) => s.layoutMetadata.site)
  const orientation = useCanvasStore((s) => s.layoutMetadata.orientation)
  const requirements = useCanvasStore((s) => s.layoutMetadata.mvpRequirements)
  const floors = useCanvasStore((s) => s.floors)
  const setSite = useCanvasStore((s) => s.setSite)
  const site = useMemo(() => parseSite(raw), [raw])
  const drawing = useSiteUi((s) => s.drawing)
  const setDrawing = useSiteUi((s) => s.setDrawing)
  const setHoveredEdge = useSiteUi((s) => s.setHoveredEdge)
  const showHeightCap = useSiteUi((s) => s.showHeightCap)
  const setShowHeightCap = useSiteUi((s) => s.setShowHeightCap)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [allEdges, setAllEdges] = useState('')
  const geojsonInput = useRef<HTMLInputElement>(null)
  const dxfInput = useRef<HTMLInputElement>(null)

  const metadata = { mvpRequirements: requirements }
  const groundFootprint = [...floors].sort((a, b) => a.level - b.level).find((f) => f.footprint?.w)?.footprint
  const plot = plotBoundary(metadata, groundFootprint)
  const front = site ? frontEdgeIndex(site.boundary, streetDirection({ orientation, mvpRequirements: requirements })) : null

  const applyBoundary = (boundary: SitePoint[], source: string) => {
    setSite(withBoundary(site, boundary))
    setMessage({ text: `Site set from ${source} (${boundary.length} edges).`, error: false })
  }
  const setRules = (patch: Partial<SiteRules>) => site && setSite({ ...site, rules: { ...site.rules, ...patch } })
  const setSetback = (index: number, value: number) =>
    site && setRules({ setbacks: site.rules.setbacks.map((s, i) => (i === index ? value : s)) })

  const importFile = async (event: ChangeEvent<HTMLInputElement>, kind: 'geojson' | 'dxf') => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setMessage(null)
    try {
      const boundary = kind === 'geojson' ? boundaryFromGeoJson(JSON.parse(await file.text())) : await importSiteDxf(file)
      applyBoundary(boundary, file.name)
    } catch (error) {
      const detail = (error as { response?: { data?: { error?: unknown } } }).response?.data?.error
      setMessage({ text: typeof detail === 'string' ? detail : (error as Error).message || 'Import failed', error: true })
    } finally {
      setBusy(false)
    }
  }

  const startDraw = () => {
    if (drawing) return setDrawing(false)
    if (!topView) onRequestTop()
    setDrawing(true)
    setMessage(null)
  }

  return (
    <details className="group rounded-xl border border-ink/10 bg-graphite-800/95 text-[11px] text-muted shadow-lg backdrop-blur">
      <summary className="cursor-pointer select-none px-3 py-2.5 font-semibold text-ink">
        Site{site ? ` · ${site.boundary.length} edges` : ''}
      </summary>
      <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto px-3 pb-2.5">
        <div role="group" aria-label="Create site" className="flex flex-wrap gap-0.5 rounded-lg bg-graphite-900/60 p-0.5">
          <button type="button" className={buttonClass} disabled={!plot} onClick={() => plot && applyBoundary(plot, 'the plot')}>
            Use plot
          </button>
          <button type="button" className={buttonClass} aria-pressed={drawing} onClick={startDraw}>
            {drawing ? 'Stop drawing' : 'Draw'}
          </button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => geojsonInput.current?.click()}>
            GeoJSON
          </button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => dxfInput.current?.click()}>
            DXF
          </button>
          {site && (
            <button type="button" className={buttonClass} onClick={() => { setSite(null); setMessage(null) }}>
              Clear
            </button>
          )}
        </div>
        <input ref={geojsonInput} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" aria-label="Import GeoJSON site" onChange={(e) => importFile(e, 'geojson')} />
        <input ref={dxfInput} type="file" accept=".dxf,application/dxf" className="hidden" aria-label="Import DXF site" onChange={(e) => importFile(e, 'dxf')} />
        {drawing && (
          <p className="text-muted-light">In Top view: click corners, click the first corner or double-click to close, Esc to cancel.</p>
        )}
        {message && (
          <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-warn' : 'text-muted-light'}>
            {message.text}
          </p>
        )}

        {site && (
          <>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-semibold text-ink">Setbacks (m)</legend>
              {site.boundary.map((_, index) => (
                <label
                  key={index}
                  className="flex items-center justify-between gap-2"
                  onMouseEnter={() => setHoveredEdge(index)}
                  onMouseLeave={() => setHoveredEdge(null)}
                >
                  <span>
                    Edge {index + 1}
                    <span className="text-muted-light"> · {edgeLength(site.boundary, index).toFixed(1)} m</span>
                    {index === front && <span className="ml-1 rounded bg-ink px-1 text-[9px] font-bold text-graphite-900">FRONT</span>}
                  </span>
                  <NumberField
                    label={`Setback, edge ${index + 1}${index === front ? ' (front)' : ''}, metres`}
                    value={site.rules.setbacks[index] ?? 0}
                    onCommit={(value) => setSetback(index, value ?? 0)}
                    onFocus={() => setHoveredEdge(index)}
                    onBlur={() => setHoveredEdge(null)}
                  />
                </label>
              ))}
              <form
                className="flex items-center justify-between gap-2 border-t border-ink/10 pt-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  const value = Number(allEdges)
                  if (allEdges.trim() === '' || !Number.isFinite(value) || value < 0) return
                  setRules({ setbacks: site.boundary.map(() => value) })
                  setAllEdges('')
                }}
              >
                <span>All edges</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label="Setback for all edges, metres"
                    min={0}
                    step={0.5}
                    value={allEdges}
                    onChange={(event) => setAllEdges(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                    className={inputClass}
                  />
                  <button type="submit" className={buttonClass}>Apply</button>
                </span>
              </form>
            </fieldset>

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-semibold text-ink">Limits</legend>
              <label className="flex items-center justify-between gap-2">
                <span>Max height (m)</span>
                <NumberField label="Maximum height, metres" value={site.rules.maxHeightM} onCommit={(v) => setRules({ maxHeightM: v || null })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Max coverage (%)</span>
                <NumberField
                  label="Maximum coverage, percent"
                  value={site.rules.maxCoverage === null ? null : Math.round(site.rules.maxCoverage * 1000) / 10}
                  max={100}
                  step={1}
                  onCommit={(v) => setRules({ maxCoverage: v ? v / 100 : null })}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Max FAR</span>
                <NumberField label="Maximum floor area ratio" value={site.rules.maxFar} step={0.1} onCommit={(v) => setRules({ maxFar: v || null })} />
              </label>
              {site.rules.maxHeightM && (
                <label className="flex items-center gap-2 text-muted-light">
                  <input type="checkbox" checked={showHeightCap} onChange={(event) => setShowHeightCap(event.target.checked)} className="accent-accent" />
                  Show height limit in 3D
                </label>
              )}
            </fieldset>
          </>
        )}
      </div>
    </details>
  )
}
