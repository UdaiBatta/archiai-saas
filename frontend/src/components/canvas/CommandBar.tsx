import { useRef, useState } from 'react'
import { QUICK_STARTS } from '../../constants/quickStarts'

type GenerationStage = 'idle' | 'extracting' | 'generating'

interface CommandBarProps {
  roomCount: number
  mode: 'generate' | 'refine'
  onModeChange: (mode: 'generate' | 'refine') => void
  designId: string | null
  showParams: boolean
  setShowParams: (value: boolean) => void
  plotWidthM: string
  setPlotWidthM: (value: string) => void
  floorsOverride: string
  setFloorsOverride: (value: string) => void
  orientation: '' | 'N' | 'S' | 'E' | 'W'
  setOrientation: (value: '' | 'N' | 'S' | 'E' | 'W') => void
  prompt: string
  setPrompt: (value: string) => void
  generating: boolean
  /** Drives the two-stage tracker: Reading brief → Designing layout. */
  generationStage?: GenerationStage
  busyLabel?: string
  generateError: string | null
  /** Aborts the in-flight extract/generate request (client-side cancel). */
  onCancel?: () => void
  onSubmit: () => void
}

function StageTracker({ stage }: { stage: GenerationStage }) {
  const steps: Array<{ key: GenerationStage; label: string }> = [
    { key: 'extracting', label: 'Reading brief' },
    { key: 'generating', label: 'Designing layout' },
  ]
  const activeIndex = stage === 'generating' ? 1 : 0
  return (
    <div className="flex items-center gap-3 text-[11px]" role="status" aria-label="Generation progress">
      {steps.map((step, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <span key={step.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                done
                  ? 'bg-ok'
                  : active
                    ? 'bg-accent motion-safe:animate-pulse'
                    : 'bg-graphite-600'
              }`}
            />
            <span className={done || active ? 'font-medium text-ink/80' : 'text-muted-light'}>
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span aria-hidden="true" className="mx-0.5 h-px w-5 bg-graphite-600" />
            )}
          </span>
        )
      })}
    </div>
  )
}

export function CommandBar({
  roomCount,
  mode,
  onModeChange,
  designId,
  showParams,
  setShowParams,
  plotWidthM,
  setPlotWidthM,
  floorsOverride,
  setFloorsOverride,
  orientation,
  setOrientation,
  prompt,
  setPrompt,
  generating,
  generationStage = 'idle',
  busyLabel,
  generateError,
  onCancel,
  onSubmit,
}: CommandBarProps) {
  const heroMode = roomCount === 0
  const [lockHint, setLockHint] = useState(false)
  const lockHintTimer = useRef<number | null>(null)
  const submitLabel = generating
    ? busyLabel ?? (mode === 'refine' ? 'Refining…' : 'Generating…')
    : mode === 'refine'
      ? 'Refine'
      : 'Generate'

  const showLockHint = () => {
    setLockHint(true)
    if (lockHintTimer.current !== null) window.clearTimeout(lockHintTimer.current)
    lockHintTimer.current = window.setTimeout(() => setLockHint(false), 2600)
  }

  const tablist = (
    <div className="flex flex-col gap-1">
      <div
        role="tablist"
        aria-label="Prompt mode"
        className="inline-flex w-fit overflow-hidden rounded-md border border-ink/10 bg-graphite-900 text-[11px]"
      >
        <button
          role="tab"
          aria-selected={mode === 'generate'}
          className={`px-3 py-1.5 ${mode === 'generate' ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
          onClick={() => onModeChange('generate')}
        >
          Generate
        </button>
        <button
          role="tab"
          aria-selected={mode === 'refine'}
          disabled={!designId}
          title={designId ? '' : 'Generate a layout first'}
          className={`px-3 py-1.5 ${mode === 'refine' ? 'bg-accent text-white' : 'text-muted hover:text-ink'} disabled:opacity-50 disabled:cursor-not-allowed`}
          onClick={() => {
            if (!designId) showLockHint()
            else onModeChange('refine')
          }}
        >
          Refine
        </button>
        {mode === 'generate' && (
          <button
            type="button"
            className="border-l border-ink/10 px-3 py-1.5 text-muted hover:bg-ink/5 hover:text-ink"
            onClick={() => setShowParams(!showParams)}
            aria-expanded={showParams}
          >
            {showParams ? 'Hide params' : 'Plot params'}
          </button>
        )}
      </div>
      {lockHint && (
        <p className="text-[10.5px] text-warn motion-safe:animate-fade-in" role="note">
          Refine unlocks after your first generated layout.
        </p>
      )}
    </div>
  )

  const paramsRow = mode === 'generate' && showParams && (
    <div className="flex gap-3 items-end text-xs text-muted">
      <label className="flex flex-col gap-1">
        Plot width (m)
        <input
          type="number"
          min={4}
          max={40}
          step={0.5}
          placeholder="auto"
          className="w-24 rounded-lg border border-ink/15 bg-graphite-700 px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-bright/60"
          value={plotWidthM}
          onChange={(e) => setPlotWidthM(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Floors
        <input
          type="number"
          min={1}
          max={5}
          placeholder="auto"
          className="w-20 rounded-lg border border-ink/15 bg-graphite-700 px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-bright/60"
          value={floorsOverride}
          onChange={(e) => setFloorsOverride(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Entry faces
        <select
          className="w-24 rounded-lg border border-ink/15 bg-graphite-700 px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-bright/60"
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as typeof orientation)}
        >
          <option value="">auto</option>
          <option value="S">South</option>
          <option value="N">North</option>
          <option value="E">East</option>
          <option value="W">West</option>
        </select>
      </label>
      <span className="text-muted-light pb-1">Leave blank to infer from the prompt</span>
    </div>
  )

  const errorNotice = generateError && (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-left shadow-sm"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger/15 text-xs font-bold text-danger"
        >
          !
        </span>
        <span className="text-xs leading-5 text-danger">{generateError}</span>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg border border-danger/30 bg-graphite-800 px-3 py-1.5 text-xs font-semibold text-danger transition hover:border-danger/50 hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onSubmit}
        disabled={generating || !prompt.trim()}
      >
        Try again
      </button>
    </div>
  )

  const generatingControls = generating && (
    <div className="flex items-center gap-2">
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-ink/15 bg-graphite-800 px-3 py-2 text-xs font-semibold text-muted hover:border-danger/50 hover:text-danger"
        >
          Cancel
        </button>
      )}
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-bright/40 border-t-accent-bright"
      />
    </div>
  )

  if (heroMode) {
    return (
      <div className="absolute left-1/2 top-1/2 z-20 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 px-4">
        <div className="mb-4 flex flex-col items-center gap-1.5 text-center motion-safe:animate-fade-up">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="text-accent-bright" aria-hidden="true">
            <path d="M12 3l2.2 5.3L20 9l-4 3.7L17 18l-5-2.8L7 18l1-5.3L4 9l5.8-.7z" />
          </svg>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            What should we build?
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            Describe your building — the engine drafts an editable 2D plan and 3D model, then you refine it.
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-graphite-800/95 p-4 shadow-[0_22px_60px_rgba(0,0,0,0.22)] backdrop-blur motion-safe:animate-fade-up">
          <div className="mb-2 flex justify-center">{tablist}</div>
          {paramsRow && <div className="mb-2 flex justify-center">{paramsRow}</div>}
          <textarea
            aria-label="Layout prompt"
            className="w-full resize-none rounded-lg border-none bg-transparent text-base text-ink placeholder:text-muted-light focus:outline-none"
            rows={3}
            placeholder="A two-storey office with 12 desks, a lobby, 4 meeting rooms, a kitchen and 2 restrooms…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={generating}
          />
          {generating ? (
            <div className="mt-3 flex items-center justify-between">
              <StageTracker stage={generationStage} />
              {generatingControls}
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-muted-light">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                AI drafts a starting point — refine it after.
              </div>
              <button
                aria-busy={generating}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white shadow-[0_6px_22px_-4px_rgba(118,99,215,0.45)] hover:bg-accent-bright disabled:bg-graphite-500 disabled:shadow-none"
                onClick={onSubmit}
                disabled={generating || !prompt.trim()}
              >
                {submitLabel}
              </button>
            </div>
          )}
        </div>
        {errorNotice && <div className="mt-2">{errorNotice}</div>}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted-light">Try:</span>
          {QUICK_STARTS.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setPrompt(q.brief)}
              className="rounded-full border border-ink/10 bg-graphite-800/85 px-3 py-1 text-xs font-medium text-muted hover:border-accent/60 hover:bg-accent-soft hover:text-ink"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="absolute bottom-14 left-1/2 z-20 flex w-[min(46rem,calc(100%-8rem))] -translate-x-1/2 flex-col gap-2 rounded-xl border border-ink/10 bg-graphite-850/96 p-2 shadow-[0_18px_50px_rgba(0,0,0,0.26)] backdrop-blur">
      <div className="flex items-center gap-2">
        {tablist}
        <textarea
          aria-label="Layout prompt"
          className="min-w-0 flex-1 resize-none rounded-md border border-ink/10 bg-graphite-800 px-3 py-2 text-xs text-ink placeholder:text-muted-light focus:outline-none focus:ring-1 focus:ring-accent-bright"
          rows={1}
          placeholder={
            mode === 'refine'
              ? "Refine your layout… e.g. 'add a bedroom', 'remove the office', 'make the kitchen bigger'"
              : 'Describe your layout… e.g. 3 bedroom apartment with open kitchen and living room'
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
        />
        {generating && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md border border-ink/15 bg-graphite-800 px-3 py-2 text-xs font-semibold text-muted hover:border-danger/50 hover:text-danger"
          >
            Cancel
          </button>
        )}
        <button
          aria-busy={generating}
          className="flex shrink-0 items-center gap-2 self-stretch rounded-md bg-accent px-5 py-2 text-xs font-semibold text-white shadow-[0_3px_12px_rgba(118,99,215,0.25)] hover:bg-accent-bright disabled:bg-graphite-500 disabled:shadow-none"
          onClick={onSubmit}
          disabled={generating || !prompt.trim()}
        >
          {generating && (
            <span
              aria-hidden="true"
              className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {submitLabel}
        </button>
      </div>
      {generating && (
        <div className="flex items-center justify-center pb-0.5">
          <StageTracker stage={generationStage} />
        </div>
      )}
      {paramsRow}
      {errorNotice}
    </div>
  )
}
