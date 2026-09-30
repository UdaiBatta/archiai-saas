import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { getApiErrorMessage } from '../../services/apiError'
import { planAssistantEdits, type AssistantResponse } from '../../services/mvp.service'
import { canvasObjectsToLayoutPlan, layoutPlanToCanvas } from '../../services/mvpLayoutAdapter'
import { useCanvasStore } from '../../store/canvasStore'
import type { Connection, Facing, PlanZoneSpan, RequirementsSpec } from '../../types/contracts'
import { DOCK_CARD } from './EditorDock'

const EXAMPLES = ['Make Bedroom 2 larger', 'Put the kitchen next to the dining room', 'Why is the balcony flagged?']
// The metadata an accepted edit replaces; the rest (prompt, views, site...) stays.
const EDIT_METADATA = ['mvpRequirements', 'mvpQuality', 'mvpEdges', 'mvpConnections', 'mvpFootprint', 'archetypeReasons', 'room_count', 'totalRooms', 'totalFloors', 'totalObjects', 'totalAreaSqm']
const btn = 'rounded-md border border-ink/15 px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/60 disabled:opacity-40'

// Same plan the post-edit validation and exports send (all floors; objects carry their floor).
function currentLayoutPlan() {
  const { rooms, floors, layoutMetadata } = useCanvasStore.getState()
  const footprint = floors[0]?.footprint
  if (!footprint) return null
  const facing = (layoutMetadata.mvpRequirements as { facing?: Facing } | undefined)?.facing
  const connections = Array.isArray(layoutMetadata.mvpConnections) ? (layoutMetadata.mvpConnections as Connection[]) : []
  return canvasObjectsToLayoutPlan(rooms, footprint, facing ?? 'east', connections, layoutMetadata.mvpFootprint as PlanZoneSpan | undefined)
}

/**
 * Plain-language edits. The server proposes; nothing on the canvas changes
 * until Apply, which lands as one ordinary undoable edit.
 */
export function AssistantPanel() {
  const selected = useCanvasStore((s) => s.rooms.find((r) => r.id === s.selectedId && r.objectType === 'room'))
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AssistantResponse | null>(null)

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const text = instruction.trim()
    if (!text || busy) return
    const layout = currentLayoutPlan()
    const requirements = useCanvasStore.getState().layoutMetadata.mvpRequirements as RequirementsSpec | undefined
    if (!layout || !layout.rooms.length || !requirements) {
      setError('Generate a plan from a brief first; the assistant edits that plan.')
      return
    }
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      setPreview(await planAssistantEdits({ instruction: text, layout, requirements, ...(selected ? { selected_room_id: selected.id } : {}) }))
    } catch (err) {
      setError(getApiErrorMessage(err, 'The assistant could not answer. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!preview) return
    const canvas = layoutPlanToCanvas(preview.layout_after, { requirements: preview.requirements_after, quality: preview.quality_after })
    const metadata = Object.fromEntries(EDIT_METADATA.filter((key) => canvas.metadata?.[key] !== undefined).map((key) => [key, canvas.metadata![key]]))
    useCanvasStore.getState().applyLayoutEdit({ ...canvas, metadata })
    setPreview(null)
    setInstruction('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) void submit(event)
  }

  const explanations = preview?.commands.filter((c) => c.op === 'explain') ?? []
  const edits = preview?.commands.filter((c) => c.op !== 'explain') ?? []

  return (
    <div className={`${DOCK_CARD} w-80`}>
      <span className="font-semibold text-ink">Assistant</span>
      {selected && <span className="text-muted-light">About {selected.label}</span>}
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <textarea
          aria-label="Instruction"
          value={instruction}
          maxLength={500}
          rows={2}
          placeholder="Describe a change or ask a question"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full resize-none rounded-md border border-ink/15 bg-graphite-900/60 px-1.5 py-1 text-[11px] text-ink"
        />
        <div className="flex flex-wrap gap-1">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="rounded-full border border-ink/10 px-2 py-0.5 text-[10px] hover:border-accent/60" onClick={() => setInstruction(example)}>
              {example}
            </button>
          ))}
        </div>
        <button type="submit" className={btn} disabled={busy || !instruction.trim()}>
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && <p role="alert" className="text-danger">{error}</p>}

      {preview && (
        <section aria-label="Assistant preview" className="flex flex-col gap-1.5 border-t border-ink/10 pt-1.5">
          {preview.summary && <p className="text-ink">{preview.summary}</p>}
          {explanations.map((c, i) => <p key={i} className="text-ink">{c.text}</p>)}
          {edits.length > 0 && (
            <ul className="list-disc pl-4">
              {edits.map((c, i) => <li key={i}>{c.description}</li>)}
            </ul>
          )}
          {preview.changed && (
            <p className={preview.introduces_hard_violations ? 'text-danger' : 'text-ink'}>
              Quality {preview.quality_before.score} → {preview.quality_after.score}
              {preview.introduces_hard_violations && ' · breaks hard rules'}
            </p>
          )}
          {preview.warnings.map((w, i) => <p key={i} className="text-warn">{w}</p>)}
          <div className="flex gap-1.5">
            {preview.changed && <button type="button" className={btn} onClick={apply}>Apply</button>}
            <button type="button" className={btn} onClick={() => setPreview(null)}>
              {preview.changed ? 'Discard' : 'Close'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
