import { useState } from 'react'
import { CanvasViewMode, useCanvasStore } from '../../store/canvasStore'

export const VIEW_MODE_OPTIONS: { value: CanvasViewMode; label: string }[] = [
  { value: 'floor_plan', label: '2D Plan' },
  { value: '3d', label: '3D Edit' },
  { value: 'zoning', label: 'Zoning' },
  { value: 'graph', label: 'Room Graph' },
]

/**
 * The single editor view switcher: 2D Plan | 3D Edit | Zoning | Room Graph.
 * All four views read the same canvas store, so switching never touches
 * layout state — only which lens renders it.
 */
export function ViewModeSwitcher({ disabled = false }: { disabled?: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)

  return (
    <div
      role="tablist"
      aria-label="Editor view"
      className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-ink/10 bg-[#1c1d1e]/95 p-0.5 shadow-lg backdrop-blur"
    >
      {VIEW_MODE_OPTIONS.filter((mode) => moreOpen || mode.value === 'floor_plan' || mode.value === '3d' || mode.value === viewMode).map((mode) => (
        <button
          key={mode.value}
          type="button"
          role="tab"
          aria-selected={viewMode === mode.value}
          disabled={disabled}
          onClick={() => setViewMode(mode.value)}
          className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            viewMode === mode.value
              ? 'bg-accent text-white shadow-[0_2px_10px_rgba(118,99,215,0.28)]'
              : 'text-muted hover:bg-ink/10 hover:text-ink'
          }`}
        >
          {mode.label}
        </button>
      ))}
      <button type="button" disabled={disabled} aria-label="More views" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="rounded-md px-2 py-1.5 text-xs text-muted hover:bg-ink/10">···</button>
    </div>
  )
}
