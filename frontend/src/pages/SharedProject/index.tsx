import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'

import { Canvas3D } from '../../components/canvas/Canvas3D'
import projectService, { SharedProject } from '../../services/project.service'
import { getApiErrorMessage } from '../../services/apiError'
import { useCanvasStore } from '../../store/canvasStore'

export default function SharedProjectPage() {
  const { token } = useParams<{ token: string }>()
  // A link made from Share ▸ Opens at ends in #<saved view id>.
  const viewId = decodeURIComponent(useLocation().hash.slice(1)) || undefined
  const [sharedProject, setSharedProject] = useState<SharedProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadLayout = useCanvasStore((state) => state.loadLayout)
  const clearLayout = useCanvasStore((state) => state.clearLayout)

  useEffect(() => {
    if (!token) {
      setError('This share link is invalid.')
      setLoading(false)
      return
    }

    let active = true
    projectService
      .getShared(token)
      .then((result) => {
        if (!active) return
        setSharedProject(result)
        if (result.layout) loadLayout(result.layout)
        else clearLayout()
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(getApiErrorMessage(err, 'This shared project is unavailable or the link was revoked.'))
        setLoading(false)
      })

    return () => {
      active = false
      clearLayout()
    }
  }, [token, loadLayout, clearLayout])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-light">Loading shared project...</div>
  }

  if (error || !sharedProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="max-w-md rounded border border-danger/30 bg-graphite-800 p-5 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-ink">Shared project unavailable</h1>
          <p className="mt-2 text-sm text-danger">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="flex h-screen flex-col bg-surface">
      <header className="border-b border-ink/10 bg-graphite-800 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-muted">ArchiAI shared project</p>
            <h1 className="mt-1 text-xl font-bold text-ink">{sharedProject.project.title}</h1>
            {sharedProject.project.description && (
              <p className="mt-1 text-sm text-muted-light">{sharedProject.project.description}</p>
            )}
          </div>
          <span className="rounded border border-ink/10 bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            Read-only saved layout
          </span>
        </div>
      </header>

      <section className="min-h-0 flex-1">
        {sharedProject.layout ? (
          <Canvas3D className="h-full" readOnly initialViewId={viewId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-light">
            This project does not have a saved layout yet.
          </div>
        )}
      </section>
    </main>
  )
}
