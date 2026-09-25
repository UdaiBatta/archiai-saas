import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Sidebar } from '../../components/layout/Sidebar'
import { Button } from '../../components/ui/Button'
import { QUICK_STARTS } from '../../constants/quickStarts'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../services/apiError'
import projectService from '../../services/project.service'

export function titleFromBrief(brief: string): string {
  const words = brief.trim().split(/\s+/).slice(0, 6).join(' ')
  if (!words) return 'Untitled project'
  return words.length > 60 ? `${words.slice(0, 57)}...` : words
}

/**
 * The one place a project starts: write the brief. Nothing is saved until
 * "Review brief", so opening this page and leaving creates no empty project.
 * The project page then reads the brief back for review straight away.
 */
export default function NewProjectPage() {
  const navigate = useNavigate()
  const { logOut, user } = useAuth()
  const [brief, setBrief] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const text = brief.trim()
    if (!text) {
      setError('Write a brief first: the plot, which way it faces, and the rooms you need.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const project = await projectService.create({ title: titleFromBrief(text) })
      navigate(`/projects/${project.id}`, { state: { initialPrompt: text, review: true } })
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create the project. Try again.'))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar userName={user?.name} userEmail={user?.email} onLogout={logOut} />
      <main className="min-w-0 flex-1 overflow-y-auto px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">New project</p>
          <h1 className="mt-3 text-4xl font-black uppercase leading-none tracking-tight text-ink" style={{ fontStretch: '125%' }}>Describe the home</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Say the plot size, which way it faces, the rooms, and how they should connect. You’ll check what was
            understood before anything is drawn.
          </p>

          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label htmlFor="brief" className="sr-only">Brief</label>
            <textarea
              id="brief"
              value={brief}
              onChange={(event) => {
                setBrief(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit()
              }}
              rows={7}
              autoFocus
              disabled={submitting}
              placeholder="East-facing 3BHK house on a 12 x 15 m plot. Master bedroom with an attached bathroom, two more bedrooms sharing a bathroom, an open kitchen into dining and living, and a balcony off the living room."
              className="w-full resize-y rounded-2xl border border-ink/10 bg-graphite-850 p-4 text-sm leading-relaxed text-ink placeholder:text-muted-light focus:border-ink/25 focus:outline-none focus:ring-2 focus:ring-ink/15"
            />
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] text-muted-light">Ctrl Enter to review</span>
              <Button type="submit" loading={submitting}>Review brief</Button>
            </div>
          </form>

          <h2 className="mt-12 text-sm font-semibold text-ink">Or start from an example</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {QUICK_STARTS.map((example) => (
              <li key={example.label}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setBrief(example.brief)
                    setError(null)
                  }}
                  className="h-full w-full rounded-xl border border-ink/10 bg-graphite-800/70 p-4 text-left transition-colors hover:border-ink/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                >
                  <span className="text-sm font-semibold text-ink">{example.label}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-light">{example.brief}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}
