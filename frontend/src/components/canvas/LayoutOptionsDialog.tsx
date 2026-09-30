import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { getApiErrorMessage } from '../../services/apiError'
import { fetchLayoutOptions } from '../../services/mvp.service'
import { layoutPlanToCanvas } from '../../services/mvpLayoutAdapter'
import { useCanvasStore } from '../../store/canvasStore'
import type { MvpLayoutOption, OptionsResponse, RequirementsSpec } from '../../types/contracts'
import { PlanThumbnail } from '../projects/PlanThumbnail'
import { Button } from '../ui/Button'

interface LayoutOptionsDialogProps {
  open: boolean
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

function currentScore(metadata: Record<string, unknown>): number | null {
  const quality = metadata.mvpQuality as { score?: unknown } | undefined
  return typeof quality?.score === 'number' ? quality.score : null
}

/**
 * Plan ▸ Options: three distinct, scored layouts the engine generates from
 * this plan's brief, beside the current plan. Using one replaces the plan as
 * a single undoable edit.
 */
export function LayoutOptionsDialog({ open, onClose }: LayoutOptionsDialogProps) {
  const rooms = useCanvasStore((s) => s.rooms)
  const metadata = useCanvasStore((s) => s.layoutMetadata)
  const requirements = metadata.mvpRequirements as RequirementsSpec | undefined
  const [result, setResult] = useState<OptionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Fetch once per opening; closing aborts an in-flight request.
  useEffect(() => {
    if (!open) return
    setResult(null)
    setError(null)
    const brief = useCanvasStore.getState().layoutMetadata.mvpRequirements as RequirementsSpec | undefined
    if (!brief) {
      setError('This plan has no brief to generate options from. Generate a plan first.')
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetchLayoutOptions(brief, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult(data) })
      .catch((err) => { if (!controller.signal.aborted) setError(getApiErrorMessage(err, 'Could not generate options')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [open])

  // Focus the dialog on open and give focus back to the opener on close.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => opener?.focus?.()
  }, [open])

  const optionLayouts = useMemo(
    () => (result?.options ?? []).map((option) =>
      layoutPlanToCanvas(option.layout, {
        requirements,
        prompt: typeof metadata.prompt === 'string' ? metadata.prompt : undefined,
      }),
    ),
    [result, requirements, metadata.prompt],
  )

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const applyOption = (index: number) => {
    useCanvasStore.getState().replaceLayout(optionLayouts[index])
    onClose()
  }

  const score = currentScore(metadata)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/70 p-4" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-options-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded border border-ink/10 bg-graphite-800 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="layout-options-title" className="text-base font-semibold text-ink">Layout options</h2>
            <p className="mt-1 text-sm text-muted-light">
              Three distinct layouts the engine generated from this plan&apos;s brief.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close options"
            onClick={onClose}
            className="text-sm text-muted-light hover:text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
          >
            Close
          </button>
        </div>

        {loading && <p role="status" className="py-10 text-center text-sm text-muted-light">Generating options…</p>}
        {error && <p role="alert" className="py-4 text-sm text-danger">{error}</p>}

        {result && (
          <>
            {result.warnings.map((warning) => (
              <p key={warning} className="mb-3 text-sm text-muted-light">{warning}</p>
            ))}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <li className="overflow-hidden rounded border border-ink/10 bg-graphite-900">
                <PlanThumbnail rooms={rooms} />
                <div className="p-3">
                  <p className="text-sm font-semibold text-ink">Current plan</p>
                  <p className="mt-0.5 text-xs text-muted-light">
                    {score === null ? 'Not scored yet' : `Score ${score}/100`}
                  </p>
                </div>
              </li>
              {result.options.map((option: MvpLayoutOption, index) => (
                <li
                  key={index}
                  className="flex flex-col overflow-hidden rounded border border-ink/10 bg-graphite-900"
                  aria-label={`Option ${index + 1}`}
                >
                  <PlanThumbnail rooms={optionLayouts[index].rooms} />
                  <div className="flex flex-1 flex-col p-3">
                    <p className="text-sm font-semibold text-ink">
                      Option {index + 1}
                      <span className="ml-2 font-normal text-muted-light">Score {option.score}/100</span>
                    </p>
                    <ul className="mt-2 flex-1 space-y-1 text-xs text-muted-light">
                      {option.highlights.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                    <Button variant="secondary" className="mt-3 min-h-8 px-3 py-1 text-sm" onClick={() => applyOption(index)}>
                      Use this option
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
