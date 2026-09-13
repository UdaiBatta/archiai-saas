import { useEffect, useMemo, useState } from 'react'

import type { ExtractResponse } from '../../types/contracts'
import type { GenerationEngine } from '../../services/mvpGenerationPolicy'

interface BriefReviewPanelProps {
  review: ExtractResponse
  engine: GenerationEngine
  busy: boolean
  error?: string | null
  onGenerate: (useDefaults: boolean, extraNotes?: string) => void
  onClarify: (answers: string[], extraNotes?: string) => void
  onCancel: () => void
}

export function BriefReviewPanel({
  review,
  engine,
  busy,
  error,
  onGenerate,
  onClarify,
  onCancel,
}: BriefReviewPanelProps) {
  const questionKey = review.questions.join('\n')
  const [answers, setAnswers] = useState<string[]>(() =>
    review.questions.map(() => ''),
  )
  // Free-text additions ('one more bedroom, a study...') re-run extraction so
  // the reviewed requirements actually pick the added rooms up.
  const [extraNotes, setExtraNotes] = useState('')

  useEffect(() => {
    setAnswers(review.questions.map(() => ''))
  }, [questionKey, review.questions])

  const blocking = review.route !== 'generate'
  const allAnswered = useMemo(
    () => answers.length > 0 && answers.every((answer) => answer.trim()),
    [answers],
  )
  const heading =
    review.route === 'conflict'
      ? 'Resolve the brief'
      : review.route === 'vague'
        ? 'A few details are needed'
        : 'AI understood'

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-graphite-950/60 p-4 backdrop-blur-[1px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Review design brief"
        className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-ink/10 bg-graphite-800 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">
              Review before generation
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">{heading}</h2>
          </div>
          <button
            type="button"
            aria-label="Edit brief"
            className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-ink/10 hover:text-ink"
            onClick={onCancel}
            disabled={busy}
          >
            Edit
          </button>
        </div>

        {review.understood_summary.length > 0 && (
          <ul className="mt-4 grid gap-2 rounded-xl bg-graphite-750 p-3 text-sm text-muted sm:grid-cols-2">
            {review.understood_summary.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-ok">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 rounded-lg border border-ink/15 bg-ink/10 px-3 py-2 text-xs text-ink">
          {engine === 'mvp'
            ? 'This brief will use the local deterministic layout engine.'
            : "Multi-floor and commercial briefs use ArchiAI's established deterministic engine to preserve current capabilities."}
        </p>

        {blocking ? (
          <div className="mt-4 space-y-3">
            {review.questions.map((question, index) => (
              <label key={question} className="block text-sm font-medium text-ink">
                {question}
                <textarea
                  aria-label={`Answer ${index + 1}`}
                  rows={2}
                  value={answers[index] ?? ''}
                  onChange={(event) =>
                    setAnswers((current) =>
                      current.map((answer, answerIndex) =>
                        answerIndex === index ? event.target.value : answer,
                      ),
                    )
                  }
                  className="mt-1.5 w-full resize-none rounded-lg border border-ink/15 bg-graphite-700 px-3 py-2 text-sm font-normal text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  disabled={busy}
                />
              </label>
            ))}
          </div>
        ) : (
          review.optional_missing.length > 0 && (
            <div className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3">
              <p className="text-sm font-semibold text-warn">Missing optional details</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warn">
                {review.optional_missing.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="mt-2 text-xs text-warn">
                You can edit the brief, or continue with transparent defaults.
              </p>
            </div>
          )
        )}

        <label className="mt-4 block text-sm font-medium text-ink">
          Add anything else?
          <textarea
            aria-label="Additional requirements"
            rows={2}
            value={extraNotes}
            placeholder="e.g. one more bedroom, a study, a garage..."
            onChange={(event) => setExtraNotes(event.target.value)}
            className="mt-1.5 w-full resize-none rounded-lg border border-ink/15 bg-graphite-700 px-3 py-2 text-sm font-normal text-ink placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-ink/30"
            disabled={busy}
          />
          <span className="mt-1 block text-xs font-normal text-muted-light">
            Optional - adds rooms or constraints on top of the brief.
          </span>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">{error}</p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-muted hover:bg-graphite-750 hover:text-ink"
            onClick={onCancel}
            disabled={busy}
          >
            Edit brief
          </button>
          {blocking ? (
            <button
              type="button"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-graphite-900 hover:bg-graphite-100 disabled:bg-graphite-500"
              onClick={() => onClarify(answers, extraNotes)}
              disabled={busy || !allAnswered}
            >
              {busy ? 'Checking...' : 'Re-check brief'}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-graphite-900 hover:bg-graphite-100 disabled:bg-graphite-500"
              onClick={() => onGenerate(review.optional_missing.length > 0, extraNotes)}
              disabled={busy}
            >
              {busy
                ? 'Generating...'
                : review.optional_missing.length > 0
                  ? 'Generate with defaults'
                  : 'Generate layout'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
