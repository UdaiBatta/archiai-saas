import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  loading = false,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 py-2 font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed'
  const variants = {
    primary:
      'bg-accent font-bold text-graphite-950 shadow-[0_6px_24px_rgba(255,59,31,0.3)] hover:-translate-y-px focus:ring-accent/50 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none',
    secondary:
      'border border-ink/15 bg-ink/5 text-ink hover:bg-ink/10 focus:ring-ink/20 disabled:opacity-50',
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
