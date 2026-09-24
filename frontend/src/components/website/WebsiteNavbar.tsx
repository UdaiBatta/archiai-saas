import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'

// Every link lands on something that exists: a section of the landing page
// (scrolled to by useHashScroll) or a real route.
const NAV_LINKS: { label: string; to: string }[] = [
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Example', to: '/#example' },
  { label: 'Features', to: '/#features' },
  { label: 'Pricing', to: '/pricing' },
]

/** Where "Start designing" goes: the editor if signed in, sign-up if not. */
export function useStartDesigningTarget() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? '/dashboard' : '/register'
}

/**
 * Top navbar for the marketing pages (landing, pricing). No editor chrome:
 * the tool rail only exists inside editor screens.
 */
export function WebsiteNavbar() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const startTarget = useStartDesigningTarget()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40'

  const isActiveLink = (to: string) => {
    const path = to.split('#')[0] || '/'
    return path !== '/' && pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className={`flex items-baseline gap-px rounded ${focusRing}`} aria-label="ArchiAI home">
            <span className="text-base font-extrabold tracking-wide text-ink">ARCHI</span>
            <span className="text-base font-extrabold tracking-wide text-muted">·AI</span>
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                aria-current={isActiveLink(link.to) ? 'page' : undefined}
                className={`rounded-md px-1 py-0.5 text-sm font-medium transition-colors ${focusRing} ${
                  isActiveLink(link.to)
                    ? 'text-ink underline decoration-ink/40 underline-offset-8'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          {!isAuthenticated && (
            <Link to="/login" className={`rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-ink ${focusRing}`}>
              Log in
            </Link>
          )}
          <Link
            to={startTarget}
            className={`rounded-lg bg-ink px-3.5 py-1.5 text-sm font-semibold text-graphite-900 hover:bg-graphite-100 ${focusRing}`}
          >
            {isAuthenticated ? 'Open dashboard' : 'Start designing'}
          </Link>
        </div>

        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-ink/10 hover:text-ink md:hidden ${focusRing}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {menuOpen && (
        <div className="border-t border-ink/10 bg-surface px-4 pb-4 pt-2 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-2 py-2 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-ink/10 pt-3">
            {!isAuthenticated && (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg border border-ink/15 px-3 py-2 text-center text-sm font-medium text-ink"
              >
                Log in
              </Link>
            )}
            <Link
              to={startTarget}
              onClick={() => setMenuOpen(false)}
              className="rounded-lg bg-ink px-3 py-2 text-center text-sm font-semibold text-graphite-900"
            >
              {isAuthenticated ? 'Open dashboard' : 'Start designing'}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
