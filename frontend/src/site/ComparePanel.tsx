import { useMemo, useState } from 'react'
import { DOCK_CARD } from '../components/canvas/EditorDock'
import { useCanvasStore } from '../store/canvasStore'
import { compareOptions, switchOption, type OptionMetrics } from './options'
import { parseSite } from './siteTypes'
import { FLOOR_USES, FLOOR_USE_LABEL } from './siteTypes'
import { USE_COLOR } from './MassLayer'

type Focus = 'gfa' | 'far' | 'homes' | 'height'
const FOCUS: { key: Focus; label: string }[] = [
  { key: 'gfa', label: 'GFA' }, { key: 'far', label: 'FAR' }, { key: 'homes', label: 'Homes' }, { key: 'height', label: 'Height' },
]
const value = (o: OptionMetrics, f: Focus) => f === 'gfa' ? o.gfa : f === 'far' ? o.far ?? 0 : f === 'homes' ? o.homes ?? 0 : o.maxHeightM
const fmt = (o: OptionMetrics, f: Focus) =>
  f === 'gfa' ? `${Math.round(o.gfa).toLocaleString()} m²` : f === 'far' ? (o.far === null ? '—' : o.far.toFixed(2)) : f === 'homes' ? (o.homes === null ? 'not filled' : String(o.homes)) : `${o.maxHeightM.toFixed(1)} m`

/**
 * Compare design options (Arcol-style): one focal number for the active
 * option, the same measure as bars across all options, and each option's
 * programme mix. Clicking a row switches to that option.
 */
export function ComparePanel() {
  const metadata = useCanvasStore((s) => s.layoutMetadata)
  const editMetadata = useCanvasStore((s) => s.editMetadata)
  const options = useMemo(() => compareOptions(metadata), [metadata])
  const rules = useMemo(() => parseSite(metadata.site)?.rules, [metadata])
  const [focus, setFocus] = useState<Focus>('gfa')
  const active = options.find((o) => o.active) ?? options[0]
  const max = Math.max(1e-9, ...options.map((o) => value(o, focus)))
  const limit = focus === 'far' ? rules?.maxFar ?? null : focus === 'height' ? rules?.maxHeightM ?? null : null

  return (
    <section aria-label="Compare options" className={`${DOCK_CARD} w-80 gap-2.5`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">Compare options</span>
        <div role="radiogroup" aria-label="Measure" className="flex gap-0.5 rounded-md bg-graphite-900/60 p-0.5">
          {FOCUS.map((f) => (
            <button key={f.key} type="button" role="radio" aria-checked={focus === f.key} onClick={() => setFocus(f.key)} className={`rounded px-1.5 py-0.5 text-[10.5px] ${focus === f.key ? 'bg-ink text-graphite-950' : 'text-muted hover:text-ink'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-ink">{fmt(active, focus)}</span>
        <span className="text-muted-light">{active.name}{limit !== null ? ` · limit ${focus === 'far' ? limit.toFixed(2) : `${limit} m`}` : ''}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {options.map((o) => {
          const over = limit !== null && value(o, focus) > limit + 1e-6
          return (
            <li key={o.id}>
              <button type="button" onClick={() => !o.active && editMetadata((m) => switchOption(m, o.id))} className="grid w-full grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-2 text-left">
                <span className={`truncate ${o.active ? 'font-semibold text-ink' : 'text-muted'}`}>{o.name}</span>
                <span className="h-2 overflow-hidden rounded-sm bg-ink/10">
                  <span className={`block h-2 ${over ? 'bg-danger' : o.active ? 'bg-ink' : 'bg-muted-light'}`} style={{ width: `${(value(o, focus) / max) * 100}%` }} />
                </span>
                <span className={`text-right font-mono tabular-nums ${over ? 'text-danger' : 'text-ink'}`}>{fmt(o, focus)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col gap-1 border-t border-ink/10 pt-2">
        <span className="text-muted-light">Programme</span>
        {options.map((o) => {
          const total = Object.values(o.gfaByUse).reduce((a, b) => a + (b ?? 0), 0) || 1
          return (
            <div key={o.id} className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <span className="truncate text-muted">{o.name}</span>
              <span className="flex h-2 overflow-hidden rounded-sm" aria-label={`${o.name} programme`}>
                {FLOOR_USES.filter((u) => o.gfaByUse[u]).map((u) => (
                  <span key={u} title={`${FLOOR_USE_LABEL[u]} ${Math.round(o.gfaByUse[u]!).toLocaleString()} m²`} style={{ width: `${(o.gfaByUse[u]! / total) * 100}%`, background: USE_COLOR[u] }} />
                ))}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
