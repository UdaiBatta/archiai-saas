import { useMemo, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useMassUi } from './massStore'
import { compareOptions, deleteOption, duplicateOption, renameOption, switchOption } from './options'

/**
 * Design options as tabs over the 3D view (Arcol-style): switch, duplicate
 * the current scheme into a new option, rename (double-click), delete.
 * Every change is one undo step.
 */
export function OptionsBar({ readOnly }: { readOnly: boolean }) {
  const metadata = useCanvasStore((s) => s.layoutMetadata)
  const editMetadata = useCanvasStore((s) => s.editMetadata)
  const options = useMemo(() => compareOptions(metadata), [metadata])
  const [renaming, setRenaming] = useState<string | null>(null)
  const go = (change: (m: Record<string, unknown>) => Record<string, unknown>) => {
    useMassUi.getState().select(null)
    editMetadata(change)
  }

  return (
    <div role="tablist" aria-label="Design options" className="flex items-center gap-1 rounded-xl border border-ink/10 bg-graphite-800/95 p-1 shadow-lg backdrop-blur">
      {options.map((o) => (
        <div key={o.id} className="flex items-center">
          {renaming === o.id ? (
            <input
              autoFocus
              aria-label="Option name"
              defaultValue={o.name}
              onBlur={(e) => { editMetadata((m) => renameOption(m, o.id, e.target.value)); setRenaming(null) }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null) }}
              className="h-8 w-28 rounded-lg border border-accent bg-graphite-900 px-2 text-xs text-ink outline-none"
            />
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected={o.active}
              onClick={() => !o.active && go((m) => switchOption(m, o.id))}
              onDoubleClick={() => !readOnly && setRenaming(o.id)}
              title={readOnly ? o.name : 'Double-click to rename'}
              className={`flex h-8 items-center gap-2 rounded-lg px-3 text-xs ${o.active ? 'bg-ink text-graphite-950' : 'text-muted hover:bg-ink/5 hover:text-ink'}`}
            >
              <span className="font-semibold">{o.name}</span>
              <span className={`font-mono tabular-nums ${o.active ? 'text-graphite-700' : 'text-muted-light'}`}>
                {o.far !== null ? `FAR ${o.far.toFixed(2)}` : `${Math.round(o.gfa).toLocaleString()} m²`}
              </span>
            </button>
          )}
          {!readOnly && o.active && options.length > 1 && renaming !== o.id && (
            <button type="button" aria-label={`Delete ${o.name}`} title={`Delete ${o.name} (undo brings it back)`} onClick={() => go((m) => deleteOption(m, o.id))} className="ml-0.5 h-8 rounded-lg px-1.5 text-xs text-muted hover:bg-danger/15 hover:text-danger">×</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" aria-label="New option from this one" title="New option: a copy of this one to change" onClick={() => go((m) => duplicateOption(m))} className="h-8 rounded-lg border border-dashed border-ink/20 px-2.5 text-xs text-ink hover:border-ink/40">
          + Option
        </button>
      )}
    </div>
  )
}
