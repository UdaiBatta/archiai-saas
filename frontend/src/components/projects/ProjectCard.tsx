import { useEffect, useState } from 'react'
import { Project } from '../../services/project.service'
import { getLatestProjectDesign } from '../../services/design.service'
import type { Room } from '../../store/canvasStore'
import { PlanThumbnail } from './PlanThumbnail'
import { panelClass } from '../website/FeatureBento'
import { formatRelative } from '../../utils/time'

interface ProjectCardProps {
  project: Project
  onClick: () => void
  /** Optional quick action — omitted (e.g. in tests) hides the button. */
  onDuplicate?: () => Promise<void> | void
}

export function ProjectCard({ project, onClick, onDuplicate }: ProjectCardProps) {
  const [duplicating, setDuplicating] = useState(false)
  // The preview is drawn from the plan itself, not the stored `thumbnail_url`
  // image (older ones are canvas screenshots with every floor stacked).
  // ponytail: one layout fetch per card; add a lightweight plan-outline field
  // to the project list API if dashboards grow large.
  // Ask for the plan itself: `thumbnail_url` is only set by the editor's save,
  // so plans made any other way (e.g. the generate API) would read as empty.
  // A project without one answers 404, which shows the empty state.
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(true)
  // Derived from real data only (a plan exists), not a fabricated stage.
  const hasSavedLayout = Boolean(rooms?.length)

  useEffect(() => {
    let live = true
    setLoadingPlan(true)
    getLatestProjectDesign(project.id)
      .then((design) => live && setRooms(design.rooms ?? []))
      .catch(() => live && setRooms(null))
      .finally(() => live && setLoadingPlan(false))
    return () => {
      live = false
    }
  }, [project.id, project.updated_at])

  const handleDuplicate = async () => {
    if (!onDuplicate || duplicating) return
    setDuplicating(true)
    try {
      await onDuplicate()
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <div className={`group relative overflow-hidden ${panelClass} transition-shadow focus-within:ring-accent/50 hover:ring-accent/40`}>
      <button
        onClick={onClick}
        className="block w-full text-left focus:outline-none"
        aria-label={`Open ${project.title}`}
      >
        <div className="relative">
          <PlanThumbnail rooms={rooms} loading={loadingPlan} />
          <span
            className={`absolute right-2 top-2 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
              hasSavedLayout ? 'bg-graphite-900/85 text-ok' : 'bg-graphite-900/85 text-muted'
            }`}
          >
            {hasSavedLayout ? 'Saved' : 'Draft'}
          </span>
        </div>
        <div className="p-4">
          <h3 className="mb-1 truncate font-semibold text-ink">{project.title}</h3>
          <p className="mb-3 truncate text-sm text-muted">
            {project.description ?? 'No description'}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted-light">
            Updated {formatRelative(project.updated_at)}
          </p>
        </div>
      </button>

      {/* Hover / focus quick actions */}
      <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center gap-2 opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          onClick={onClick}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-graphite-950 shadow-lg"
        >
          Open
        </button>
        {onDuplicate && (
          <button
            type="button"
            onClick={handleDuplicate}
            disabled={duplicating}
            className="rounded-full border border-ink/20 bg-graphite-900/90 px-4 py-1.5 text-xs font-semibold text-ink shadow-lg backdrop-blur hover:bg-graphite-800 disabled:opacity-60"
          >
            {duplicating ? 'Duplicating…' : 'Duplicate'}
          </button>
        )}
      </div>
    </div>
  )
}
