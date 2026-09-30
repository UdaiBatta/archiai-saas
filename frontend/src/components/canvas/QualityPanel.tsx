import type { MvpQualitySnapshot, QualityWarning } from '../../types/contracts'
import { useCanvasStore } from '../../store/canvasStore'
import { violationHelp } from './violationHelp'

const PACK_TITLES: Record<string, string> = {
  generic: 'Layout guidance',
  residential: 'Residential guidance',
  healthcare: 'Healthcare guidance',
  workplace: 'Workplace guidance',
  hospitality_edu: 'Hospitality & education guidance',
  vastu: 'Vastu guidance',
}

function packTitle(key: string): string {
  if (PACK_TITLES[key]) return PACK_TITLES[key]
  const label = key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  return `${label} guidance`
}

function GuidanceList({
  title,
  warnings,
}: {
  title: string
  warnings: QualityWarning[]
}) {
  if (warnings.length === 0) return null
  return (
    <div className="border-t border-ink/10 pt-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-light">
        {title}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {warnings.map((warning, index) => (
          <li
            key={`${warning.code}-${index}`}
            className="flex gap-2 text-[10px] leading-relaxed text-muted"
          >
            <span
              aria-hidden="true"
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                warning.severity === 'warn' ? 'bg-warn' : 'bg-accent-bright'
              }`}
            />
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function QualityPanel({ quality }: { quality: MvpQualitySnapshot }) {
  const warningsByPack = quality.warnings.reduce<Record<string, QualityWarning[]>>(
    (groups, warning) => {
      (groups[warning.rule] ??= []).push(warning)
      return groups
    },
    {},
  )

  return (
    <section
      data-testid="quality-panel"
      aria-label="Concept quality"
      className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold text-ink">Concept quality</h3>
          <p className="mt-0.5 text-[9px] text-muted-light">Advisory early-design checks</p>
        </div>
        {quality.valid ? (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-bright/45 bg-accent-soft font-mono text-xs font-semibold tabular-nums text-ink"
            aria-label={`Quality score ${quality.score} out of 100`}
          >
            {quality.score}
          </div>
        ) : (
          <span className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger">
            Invalid layout
          </span>
        )}
      </div>

      {!quality.valid && quality.hard_violations.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1.5 border-t border-danger/20 pt-2.5">
          {quality.hard_violations.map((violation, index) => {
            const help = violationHelp(violation.code)
            const roomId = violation.room_ids[0]
            return (
              <li key={`${violation.code}-${index}`} className="text-[10px] leading-relaxed">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-1.5 text-danger marker:hidden">
                    <span aria-hidden className="mt-px text-[8px] transition-transform group-open:rotate-90">▶</span>
                    <span className="flex-1">{violation.message}</span>
                  </summary>
                  <div className="mt-1 space-y-1 pl-3 text-muted">
                    <p><span className="font-semibold text-ink/80">Why: </span>{help.why}</p>
                    <p><span className="font-semibold text-ink/80">Fix: </span>{help.fix}</p>
                    {roomId && (
                      <button type="button" onClick={() => useCanvasStore.getState().selectRoom(roomId)} className="rounded border border-ink/15 px-1.5 py-0.5 text-[10px] text-ink hover:border-ink/30">
                        Show {violation.room_ids.length > 1 ? 'first room' : 'room'}
                      </button>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      {quality.valid && quality.warnings.length === 0 && (
        <p className="mt-2.5 border-t border-ink/10 pt-2.5 text-[10px] text-ok">
          No soft issues detected in this concept.
        </p>
      )}
      {Object.entries(warningsByPack).map(([pack, warnings]) => (
        <GuidanceList key={pack} title={packTitle(pack)} warnings={warnings} />
      ))}
    </section>
  )
}
