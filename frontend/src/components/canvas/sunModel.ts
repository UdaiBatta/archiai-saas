/**
 * Where the sun is at a given hour, for the 3D view's light. Plan space is
 * fixed to the compass (x = east, z = south; see the backend's Rect), so an
 * east-facing house really gets the morning sun on its street side.
 *
 * ponytail: a simple arc for India's latitudes (~8-35°N): sunrise due east at
 * 06:00, noon high in the southern sky, sunset due west at 18:00. Swap in a
 * real solar-position formula (latitude + date) if seasonal studies matter.
 */
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

export function sunAt(hour: number): Sun {
  const h = Math.min(SUNSET, Math.max(SUNRISE, hour))
  const arc = (Math.PI * (h - SUNRISE)) / (SUNSET - SUNRISE) // 0 at sunrise, π at sunset
  const height = Math.sin(arc)
  const raw: [number, number, number] = [Math.cos(arc), 0.05 + 0.95 * height, 0.45 * height]
  const length = Math.hypot(...raw)
  const direction = raw.map((v) => v / length) as [number, number, number]
  // Warm and low near sunrise/sunset, near-white at noon.
  const color = `rgb(255, ${lerp(176, 244, height)}, ${lerp(112, 230, height)})`
  const label = h < 11 ? 'Morning light from the east' : h <= 13 ? 'Midday sun from the south' : 'Evening light from the west'
  return { direction, color, intensity: 0.55 + 0.95 * height, label }
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
