import type { RefinementChange } from '../../services/design.service'

interface RefinementPlaybackPanelProps {
  changes: RefinementChange[]
  activeIndex: number
  completedCount: number
  /** Jumps the playback straight to the final refined layout. */
  onSkip?: () => void
}

const ACTION_STYLES: Record<RefinementChange['action'], string> = {
  resize: 'bg-warn/15 text-warn',
  remove: 'bg-danger/15 text-danger',
  add: 'bg-ok/15 text-ok',
}

export function RefinementPlaybackPanel({
  changes,
  activeIndex,
  completedCount,
  onSkip,
}: RefinementPlaybackPanelProps) {
  const finished = completedCount >= changes.length
  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Refinement progress"
      className="absolute right-4 top-20 z-30 w-72 rounded-2xl border border-ink/10 bg-graphite-800/95 p-3.5 shadow-[0_16px_45px_rgba(0,0,0,0.22)] backdrop-blur motion-safe:animate-fade-in"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-ink">Applying refinement</p>
          <p className="mt-0.5 text-[10px] text-muted-light">
            Changes are applied to the canvas in order
          </p>
        </div>
        <span className="rounded-full bg-ink/15 px-2 py-1 font-mono text-[10px] font-semibold text-ink">
          {Math.min(completedCount, changes.length)}/{changes.length}
        </span>
      </div>

      <ol className="space-y-1.5">
        {changes.map((change, index) => {
          const complete = index < completedCount
          const active = index === activeIndex && !complete
          return (
            <li
              key={`${change.action}-${change.objectId}`}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                active
                  ? 'border-ink/20 bg-ink/10'
                  : complete
                    ? 'border-ok/30 bg-ok/10'
                    : 'border-ink/10 bg-graphite-800/70'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  complete ? 'bg-ok text-graphite-900' : ACTION_STYLES[change.action]
                }`}
              >
                {complete ? '✓' : active ? '→' : index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted">
                {change.description}
              </span>
            </li>
          )
        })}
      </ol>

      {onSkip && !finished && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink/10 bg-graphite-800 px-2 py-1.5 text-[11px] font-semibold text-muted hover:border-accent/60 hover:text-ink"
        >
          Skip — jump to final layout
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </aside>
  )
}
