import { forwardRef, InputHTMLAttributes, ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  /** One-line help under the field (linked via aria-describedby). */
  hint?: ReactNode
  /** Content pinned inside the field's right edge (an icon or small button). */
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, trailing, id, ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
    const hintId = hint ? `${inputId}-hint` : undefined
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink/80">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            aria-describedby={hintId}
            aria-invalid={error ? true : undefined}
            {...props}
            className={`w-full rounded-lg border bg-graphite-700 px-3 py-2 text-sm text-ink placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-accent/40 read-only:cursor-default read-only:border-ink/10 read-only:bg-graphite-800 read-only:text-muted read-only:focus:ring-0 disabled:cursor-default disabled:border-ink/10 disabled:bg-graphite-800 disabled:text-muted ${
              trailing ? 'pr-10' : ''
            } ${error ? 'border-danger' : 'border-ink/15'}`}
          />
          {trailing && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 text-muted-light">{trailing}</div>
          )}
        </div>
        {hint && (
          <p id={hintId} className="text-xs text-muted-light">
            {hint}
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
