import { useEffect, type ReactNode } from 'react'
import { DOCK_CARD } from '../components/canvas/EditorDock'
import { daylightHours, formatHour, sunAt } from '../components/canvas/sunModel'
import { setSunLocation, useSunContext, useSunUi } from './sunStore'

const QUICK_DATES = [
  ['06-21', 'Jun 21'],
  ['03-21', 'Mar/Sep 21'],
  ['12-21', 'Dec 21'],
] as const

const chip = (active: boolean) =>
  `rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
    active ? 'bg-accent text-graphite-950' : 'bg-ink/5 text-muted hover:bg-ink/10 hover:text-ink'
  }`
const field = 'w-20 rounded-md border border-ink/10 bg-graphite-900/60 px-2 py-1 text-[11px] text-ink'

/** The Sun dock popover: time of day, date and site location for the real sun. */
export function SunPanel({ hour, onHour, children }: { hour: number; onHour: (hour: number) => void; children?: ReactNode }) {
  const where = useSunContext()
  const setDate = useSunUi((s) => s.setDate)
  const { sunrise, sunset } = daylightHours(where)
  // Slider in quarter hours, inside daylight.
  const min = Math.ceil(sunrise * 4) / 4
  const max = Math.max(min, Math.floor(sunset * 4) / 4)
  const value = Math.min(max, Math.max(min, hour))
  useEffect(() => {
    if (value !== hour) onHour(value)
  }, [value, hour, onHour])
  const year = where.date.slice(0, 4)

  const commit = (key: 'lat' | 'lon', raw: string) => {
    const n = Number(raw)
    const limit = key === 'lat' ? 90 : 180
    if (raw.trim() === '' || !Number.isFinite(n) || Math.abs(n) > limit) return
    if (n !== where[key]) setSunLocation({ lat: where.lat, lon: where.lon, [key]: n })
  }
  const locationInput = (key: 'lat' | 'lon', label: string) => (
    <label className="flex items-center gap-1.5">
      <span>{label}</span>
      <input
        key={where[key]}
        type="number"
        step={0.1}
        min={key === 'lat' ? -90 : -180}
        max={key === 'lat' ? 90 : 180}
        aria-label={key === 'lat' ? 'Latitude' : 'Longitude'}
        defaultValue={where[key]}
        onBlur={(event) => commit(key, event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        className={field}
      />
    </label>
  )

  return (
    <div className={DOCK_CARD}>
      <span className="font-semibold text-ink">Sun · {formatHour(value)} solar time</span>
      <span className="text-muted-light">{sunAt(value, where).label}</span>
      <input
        type="range"
        aria-label="Time of day"
        min={min}
        max={max}
        step={0.25}
        value={value}
        onChange={(event) => onHour(Number(event.target.value))}
        className="accent-accent"
      />
      <span className="text-muted-light">
        Sunrise {formatHour(sunrise)} · sunset {formatHour(sunset)}
      </span>
      <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-ink/10 pt-2" role="group" aria-label="Date">
        {QUICK_DATES.map(([md, label]) => (
          <button key={md} type="button" className={chip(where.date.slice(5) === md)} onClick={() => setDate(`${year}-${md}`)}>
            {label}
          </button>
        ))}
        <input
          type="date"
          aria-label="Date"
          value={where.date}
          onChange={(event) => event.target.value && setDate(event.target.value)}
          className="rounded-md border border-ink/10 bg-graphite-900/60 px-2 py-1 text-[11px] text-ink"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {locationInput('lat', 'Lat')}
        {locationInput('lon', 'Lon')}
      </div>
      {where.isDefault && <span className="text-warn">Default location: Delhi (28.6°N, 77.2°E). Set the site's own.</span>}
      {children}
    </div>
  )
}
