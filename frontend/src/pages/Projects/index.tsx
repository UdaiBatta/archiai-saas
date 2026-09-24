import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Sidebar } from '../../components/layout/Sidebar'
import { ProjectCard } from '../../components/projects/ProjectCard'
import { useAuth } from '../../hooks/useAuth'
import { getApiErrorMessage } from '../../services/apiError'
import projectService, { type Project } from '../../services/project.service'

const newProjectClass =
  'rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-graphite-900 hover:bg-graphite-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40'

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-ink/10 bg-graphite-800">
      <div className="h-36 w-full bg-graphite-750" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 rounded bg-graphite-750" />
        <div className="h-3 w-1/2 rounded bg-graphite-750" />
      </div>
    </div>
  )
}

/**
 * Your projects: find one and reopen it, or start a new one. Writing a brief
 * happens on /projects/new only, so this page has no prompt box of its own.
 */
export default function ProjectsPage() {
  const navigate = useNavigate()
  const { logOut, user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    projectService
      .list()
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Invalid projects response')
        setProjects(data)
      })
      .catch((err) => setError(getApiErrorMessage(err, 'Failed to load projects')))
      .finally(() => setLoading(false))
  }, [])

  const handleDuplicate = async (project: Project) => {
    setActionError(null)
    try {
      const copy = await projectService.duplicate(project.id)
      setProjects((prev) => [copy, ...prev])
    } catch (err) {
      setActionError(getApiErrorMessage(err, `Failed to duplicate ${project.title}`))
    }
  }

  const query = search.trim().toLowerCase()
  const visible = projects
    .filter((project) => project.title.toLowerCase().includes(query))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        userName={user?.name}
        userEmail={user?.email}
        onLogout={logOut}
        projectCount={loading ? undefined : projects.length}
      />

      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Your projects</h1>
          <div className="flex items-center gap-2">
            {projects.length > 0 && (
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects"
                aria-label="Search projects"
                className="w-48 rounded-lg border border-ink/10 bg-graphite-800/70 px-3 py-2 text-sm text-ink placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-ink/25 sm:w-64"
              />
            )}
            <Link to="/projects/new" className={newProjectClass}>New project</Link>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{actionError}</p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
        ) : projects.length === 0 ? (
          <section className="mx-auto mt-16 max-w-md text-center">
            <h2 className="text-lg font-bold text-ink">Start your first project</h2>
            <p className="mt-2 text-sm text-muted">
              Describe the home you want: the plot, which way it faces, and the rooms. You’ll check what was
              understood before any plan is drawn.
            </p>
            <Link to="/projects/new" className={`mt-5 inline-block ${newProjectClass}`}>Write your first brief</Link>
          </section>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-light">No projects match “{search}”.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => navigate(`/projects/${project.id}`)}
                onDuplicate={() => handleDuplicate(project)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
