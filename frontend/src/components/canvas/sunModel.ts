/**
 * Where the sun is at a given hour, for the 3D view's light. Plan space is
 * fixed to the compass (x = east, z = south; see the backend's Rect), so an
 * east-facing house really gets the morning sun on its street side.
 *
 * With a location and date the sun is the real one (analysis/solar.ts, hour =
 * local solar time). Without, a stylised arc for India's latitudes: sunrise
 * due east at 06:00, noon high in the southern sky, sunset due west at 18:00.
 */
import { solarPosition, sunriseSunset, sunVector, type Where } from '../../analysis/solar'

export const SUNRISE = 6
export const SUNSET = 18

export interface Sun {
  /** Unit vector from the house toward the sun. */
  direction: [number, number, number]
  color: string
  intensity: number
  label: string
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

function light(direction: [number, number, number], height: number) {
  // Warm and low near sunrise/sunset, near-white at noon.
  const color = `rgb(255, ${lerp(176, 244, height)}, ${lerp(112, 230, height)})`
  return { direction, color, intensity: 0.55 + 0.95 * height }
}

/** Slider range: the real sunrise..sunset (solar time), or the arc's 06-18. */
export function daylightHours(where?: Where): { sunrise: number; sunset: number } {
  return where ? sunriseSunset(where) : { sunrise: SUNRISE, sunset: SUNSET }
}

export function sunAt(hour: number, where?: Where): Sun {
  if (where) {
    const position = solarPosition(where, hour)
    const [x, y, z] = sunVector(position)
    // Keep the light just above the horizon so it never shines up from below.
    const raw: [number, number, number] = [x, Math.max(0.05, y), z]
    const length = Math.hypot(...raw)
    const height = Math.max(0, y)
    const from = COMPASS[Math.round(position.azimuth / 45) % 8]
    const label = position.altitude <= 0 ? 'Sun below the horizon' : `Sun from the ${from}, ${Math.round(position.altitude)}° high`
    return { ...light(raw.map((v) => v / length) as [number, number, number], height), label }
  }
  const h = Math.min(SUNSET, Math.max(SUNRISE, hour))
  const arc = (Math.PI * (h - SUNRISE)) / (SUNSET - SUNRISE) // 0 at sunrise, π at sunset
  const height = Math.sin(arc)
  const raw: [number, number, number] = [Math.cos(arc), 0.05 + 0.95 * height, 0.45 * height]
  const length = Math.hypot(...raw)
  const direction = raw.map((v) => v / length) as [number, number, number]
  const label = h < 11 ? 'Morning light from the east' : h <= 13 ? 'Midday sun from the south' : 'Evening light from the west'
  return { ...light(direction, height), label }
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
