import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useAuth } from '../../hooks/useAuth'
import { AccountMenu } from '../ui/AccountMenu'

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
  return isAuthenticated ? '/projects' : '/register'
}

/**
 * The link pill: a highlight slides under whichever link is hovered or
 * focused, and the label inverts over it (mix-blend-difference).
 */
function NavPill({ isActive }: { isActive: (to: string) => boolean }) {
  const [cursor, setCursor] = useState({ left: 0, width: 0, opacity: 0 })
  // Measure the <li> (positioned inside the pill), not the link inside it.
  const moveTo = (link: HTMLElement) => {
    const item = link.parentElement ?? link
    setCursor({ left: item.offsetLeft, width: item.offsetWidth, opacity: 1 })
  }

  return (
    <ul
      className="relative flex items-center rounded-full border border-ink/15 bg-graphite-950/60 p-1 backdrop-blur-md"
      onMouseLeave={() => setCursor((c) => ({ ...c, opacity: 0 }))}
    >
      {NAV_LINKS.map((link) => (
        // The blend lives on the <li>: it is the layer that sits over the
        // highlight, so its label inverts (white -> dark) where they overlap.
        <li key={link.label} className="relative z-10 mix-blend-difference">
          <Link
            to={link.to}
            aria-current={isActive(link.to) ? 'page' : undefined}
            onMouseEnter={(e) => moveTo(e.currentTarget)}
            onFocus={(e) => moveTo(e.currentTarget)}
            onBlur={() => setCursor((c) => ({ ...c, opacity: 0 }))}
            className={`block rounded-full px-4 py-1.5 text-sm font-medium text-white focus-visible:outline-none ${
              isActive(link.to) ? 'underline decoration-ember decoration-2 underline-offset-[6px]' : ''
            }`}
          >
            {link.label}
          </Link>
        </li>
      ))}
      <li
        aria-hidden="true"
        className="absolute inset-y-1 z-0 rounded-full bg-ink transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{ left: cursor.left, width: cursor.width, opacity: cursor.opacity }}
      />
    </ul>
  )
}

/**
 * Navbar for the marketing pages (landing, pricing). No bar at all: the
 * logo, the link pill and the actions float as separate pieces, each with
 * its own blur so it stays readable over whatever scrolls beneath.
 */
export function WebsiteNavbar() {
  const { isAuthenticated, user, logOut } = useAuth()
  const startTarget = useStartDesigningTarget()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50'

  const isActive = (to: string) => {
    const path = to.split('#')[0] || '/'
    return path !== '/' && pathname.startsWith(path)
  }

  return (
    <header
      className={`sticky top-0 z-40 ${menuOpen ? 'bg-night/95 backdrop-blur-md' : ''}`}
    >
      <nav aria-label="Main" className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className={`flex items-baseline gap-px justify-self-start rounded-full border border-ink/15 bg-graphite-950/60 px-4 py-2 backdrop-blur-md ${focusRing}`} aria-label="ArchiAI home">
          <span className="text-base font-black tracking-wide text-ink" style={{ fontStretch: '125%' }}>ARCHI</span>
          <span className="text-base font-black tracking-wide text-ember" style={{ fontStretch: '125%' }}>·AI</span>
        </Link>

        <div className="hidden md:block">
          <NavPill isActive={isActive} />
        </div>

        <div className="hidden items-center gap-2 justify-self-end md:flex">
          {!isAuthenticated && (
            <Link to="/login" className={`rounded-full border border-ink/15 bg-graphite-950/60 px-4 py-2 text-sm font-medium text-graphite-100 backdrop-blur-md hover:text-ink ${focusRing}`}>
              Log in
            </Link>
          )}
          <Link
            to={startTarget}
            className={`rounded-full bg-ember px-4 py-2 text-sm font-bold text-graphite-950 shadow-[0_6px_24px_rgba(255,59,31,0.35)] transition-transform hover:-translate-y-px ${focusRing}`}
          >
            {isAuthenticated ? 'Your projects' : 'Start designing'}
          </Link>
          {isAuthenticated && <AccountMenu name={user?.name} email={user?.email} onSignOut={logOut} />}
        </div>

        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className={`col-start-3 flex h-9 w-9 items-center justify-center justify-self-end rounded-full text-graphite-100 hover:bg-ink/10 hover:text-ink md:hidden ${focusRing}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {menuOpen && (
        <div className="border-t border-ink/10 px-4 pb-4 pt-2 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={link.to}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-2 py-2 text-sm font-medium text-graphite-100 hover:bg-ink/5 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-ink/10 pt-3">
            {!isAuthenticated && (
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-full border border-ink/15 px-3 py-2 text-center text-sm font-medium text-ink"
              >
                Log in
              </Link>
            )}
            <Link
              to={startTarget}
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-ember px-3 py-2 text-center text-sm font-bold text-graphite-950"
            >
              {isAuthenticated ? 'Your projects' : 'Start designing'}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
