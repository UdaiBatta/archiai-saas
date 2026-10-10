/**
 * Matte hours slider: a header with the label and the formatted value, a
 * soft rail over a 00-24 clock with hour marks, an optional shaded window
 * (e.g. daylight) and either one thumb (a time) or two (a time window).
 * After the "matte hours slider" design the team picked; rebuilt as a
 * controlled React component on native range inputs (keyboard and screen
 * readers work as for any slider). Thumb styles live in index.css
 * (.matte-slider).
 */
import { useId } from 'react'

export interface HoursSliderProps {
  /** One value (a time) or two (a window, low <= high). */
  value: number[]
  onChange: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  label: string
  /** Shaded part of the rail, e.g. [sunrise, sunset]; thumbs stay inside it. */
  window?: [number, number]
  format?: (hours: number) => string
  /** Accessible names of the thumbs, in order. */
  thumbLabels?: string[]
  className?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
export const formatClock = (hours: number) => `${pad(Math.floor(hours))}:${pad(Math.round((hours % 1) * 60) % 60)}`

export function HoursSlider({
  value,
  onChange,
  min = 0,
  max = 24,
  step = 1,
  label,
  window: band,
  format = formatClock,
  thumbLabels,
  className = '',
}: HoursSliderProps) {
  const id = useId()
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const lo = band ? band[0] : min
  const hi = band ? band[1] : max
  const range = value.length === 2
  const fill = range ? [value[0], value[1]] : [lo, value[0]]
  const set = (index: number, next: number) => {
    const clamped = Math.min(hi, Math.max(lo, next))
    const out = [...value]
    out[index] = clamped
    if (range && out[0] > out[1]) out[index === 0 ? 1 : 0] = clamped
    onChange(out)
  }
  const marks = [0, 6, 12, 18, 24].filter((h) => h >= min && h <= max)

  return (
    <fieldset className={`matte-slider ${className}`}>
      <legend className="sr-only">{label}</legend>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold text-ink">{label}</span>
        <output htmlFor={value.map((_, i) => `${id}-${i}`).join(' ')} className="font-mono text-[11px] tabular-nums text-ink">
          {value.map(format).join(' – ')}
        </output>
      </div>
      <div className="relative h-6">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/10" />
        {band && (
          <span
            aria-hidden
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/15"
            style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
          />
        )}
        <span
          aria-hidden
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${pct(fill[0])}%`, width: `${Math.max(0, pct(fill[1]) - pct(fill[0]))}%` }}
        />
        {value.map((v, i) => (
          <input
            key={i}
            id={`${id}-${i}`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={v}
            aria-label={thumbLabels?.[i] ?? label}
            aria-valuetext={format(v)}
            onChange={(event) => set(i, Number(event.target.value))}
            className="absolute inset-0 h-6 w-full"
          />
        ))}
      </div>
      <div aria-hidden className="mt-1 flex justify-between font-mono text-[9px] text-muted-light">
        {marks.map((h) => <span key={h}>{pad(h)}</span>)}
      </div>
    </fieldset>
  )
}

export default HoursSlider
