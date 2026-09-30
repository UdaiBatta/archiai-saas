import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sidebar } from '../../components/layout/Sidebar'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../services/apiError'
import { saveMvpVersion } from '../../services/mvp.service'
import projectService from '../../services/project.service'
import type { Facing, LayoutPlan, RequirementsSpec } from '../../types/contracts'

const FACINGS: Facing[] = ['north', 'east', 'south', 'west']

/** An empty plan on the plot: the editor opens on it and rooms are drawn by hand. */
export function blankPlan(width: number, depth: number, facing: Facing): { requirements: RequirementsSpec; layout: LayoutPlan } {
  return {
    requirements: {
      building_type: 'house',
      floors: 1,
      rooms: [],
      adjacency: [],
      avoid_adjacency: [],
      plot: { width_m: width, depth_m: depth },
      facing,
      missing_info: [],
    },
    layout: { plot: { width_m: width, depth_m: depth, facing }, rooms: [], walls: [], doors: [], windows: [] } as LayoutPlan,
  }
}

const inputClass =
  'w-full rounded-xl border border-ink/10 bg-graphite-850 px-3 py-2.5 text-sm text-ink placeholder:text-muted-light focus:border-ink/25 focus:outline-none focus:ring-2 focus:ring-ink/15'

/**
 * A project starts as a plot in the editor, drawn by hand. The AI comes in
 * later, to improve what is there (dock ▸ Assistant, options), not to write
 * the first plan.
 */
export default function NewProjectPage() {
  const navigate = useNavigate()
  const { logOut, user } = useAuth()
  const [title, setTitle] = useState('')
  const [width, setWidth] = useState('12')
  const [depth, setDepth] = useState('15')
  const [facing, setFacing] = useState<Facing>('east')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const w = Number(width)
    const d = Number(depth)
    if (!(w >= 4 && w <= 500 && d >= 4 && d <= 500)) {
      setError('Plot sides must be between 4 and 500 m.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const project = await projectService.create({ title: title.trim() || 'Untitled project' })
      await saveMvpVersion(project.id, blankPlan(w, d, facing))
      navigate(`/projects/${project.id}?view=2d`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create the project. Try again.'))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar userName={user?.name} userEmail={user?.email} onLogout={logOut} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">New project</p>
          <h1 className="mt-3 text-4xl font-black uppercase leading-none tracking-tight text-ink" style={{ fontStretch: '125%' }}>Set out the plot</h1>
          <p className="mt-2 text-sm text-muted">
            Start from the plot and draw the rooms yourself. Walls, doors and windows follow as rooms meet; the
            assistant can review and improve the plan once you have one.
          </p>
          <form
            noValidate
            className="mt-8 space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-ink">Project name</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled project" autoFocus disabled={submitting} className={inputClass} />
            </label>
            <fieldset disabled={submitting}>
              <legend className="mb-1.5 text-xs font-medium text-ink">Plot size (m)</legend>
              <div className="flex items-center gap-2">
                <input aria-label="Plot width (m)" type="number" min={4} max={500} step={0.1} value={width} onChange={(event) => { setWidth(event.target.value); setError(null) }} className={`${inputClass} font-mono tabular-nums`} />
                <span className="text-muted">×</span>
                <input aria-label="Plot depth (m)" type="number" min={4} max={500} step={0.1} value={depth} onChange={(event) => { setDepth(event.target.value); setError(null) }} className={`${inputClass} font-mono tabular-nums`} />
              </div>
            </fieldset>
            <fieldset disabled={submitting}>
              <legend className="mb-1.5 text-xs font-medium text-ink">Road / entrance side</legend>
              <div role="radiogroup" aria-label="Facing" className="grid grid-cols-4 gap-1 rounded-xl border border-ink/10 bg-graphite-850 p-1">
                {FACINGS.map((side) => (
                  <button
                    key={side}
                    type="button"
                    role="radio"
                    aria-checked={facing === side}
                    onClick={() => setFacing(side)}
                    className={`rounded-lg py-2 text-xs font-medium capitalize ${facing === side ? 'bg-ink text-graphite-950' : 'text-muted hover:text-ink'}`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </fieldset>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" loading={submitting}>Open the editor</Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
