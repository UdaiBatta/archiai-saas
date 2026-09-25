import { Link } from 'react-router-dom'

export function WebsiteFooter() {
  return (
    <footer className="border-t border-ink/10 bg-night">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
        <div>
          <div className="flex items-baseline gap-px">
            <span className="text-sm font-extrabold tracking-wide text-ink">ARCHI</span>
            <span className="text-sm font-extrabold tracking-wide text-muted">·AI</span>
          </div>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-light">
            From a written brief to a checked, editable floor plan in 2D and 3D.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
          <Link to="/#how-it-works" className="hover:text-ink">How it works</Link>
          <Link to="/#example" className="hover:text-ink">Example</Link>
          <Link to="/#features" className="hover:text-ink">Features</Link>
          <Link to="/pricing" className="hover:text-ink">Pricing</Link>
          <Link to="/login" className="hover:text-ink">Log in</Link>
          <Link to="/register" className="hover:text-ink">Create account</Link>
        </nav>
      </div>
      <div className="border-t border-ink/5 py-4 text-center text-[11px] text-muted-light">
        © {new Date().getFullYear()} ArchiAI
      </div>
    </footer>
  )
}
