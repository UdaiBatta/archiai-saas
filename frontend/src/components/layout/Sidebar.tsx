import { NavLink } from 'react-router-dom'

import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'

interface SidebarProps {
  userName?: string
  userEmail?: string
  onLogout: () => void
  /** Shown as a count badge next to "Projects" — omitted (not zero) when the
   * caller hasn't loaded a project list, so the sidebar never shows a fake 0. */
  projectCount?: number
}

const ICONS = {
  projects: <path d="M3 7l9 5 9-5M3 7v10l9 5 9-5V7M3 7l9-4 9 4" />,
  workspaces: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
}

function NavIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      aria-hidden="true"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  )
}

export function Sidebar({
  userName,
  userEmail,
  onLogout,
  projectCount,
}: SidebarProps) {
  const navClassName = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-ink/10 text-ink' : 'text-muted hover:bg-ink/5 hover:text-ink'
    }`

  const displayName = userName ?? userEmail ?? ''

  return (
    <aside className="flex w-44 flex-shrink-0 flex-col bg-graphite-800/80 backdrop-blur text-ink lg:w-52 border-r border-ink/10">
      <div className="border-b border-ink/10 p-4">
        <span className="text-lg font-bold">ArchiAI</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        <NavLink to="/projects" className={navClassName}>
          <NavIcon name="projects" />
          <span className="flex-1">Projects</span>
          {typeof projectCount === 'number' && (
            <span className="font-mono text-xs text-muted-light">{projectCount}</span>
          )}
        </NavLink>
        <NavLink to="/workspaces" className={navClassName}>
          <NavIcon name="workspaces" />
          <span className="flex-1">Workspaces</span>
        </NavLink>
      </nav>
      <div className="border-t border-ink/10 p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <Avatar name={displayName} size={8} />
          <p className="min-w-0 truncate text-sm text-muted">{displayName}</p>
        </div>
        <Button variant="secondary" onClick={onLogout} className="w-full text-sm">
          Logout
        </Button>
      </div>
    </aside>
  )
}
