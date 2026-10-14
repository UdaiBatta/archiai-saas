/**
 * Site and massing data (roadmap P2), stored in `layoutMetadata.site` and
 * `layoutMetadata.masses`: saved with the project, part of undo history.
 *
 * World coordinates in metres, same as the canvas: x east, z south, y up.
 */
export interface SitePoint {
  x: number
  z: number
}

export interface SiteRules {
  /** Setback in metres per boundary edge; edge i runs boundary[i] -> boundary[i + 1]. */
  setbacks: number[]
  /** Maximum building height above ground, metres. */
  maxHeightM: number | null
  /** Maximum building footprint / site area, 0..1. */
  maxCoverage: number | null
  /** Maximum gross floor area / site area. */
  maxFar: number | null
}

/** Where the site is on Earth, for the real sun (P5). Degrees, north / east positive. */
export interface SiteLocation {
  lat: number
  lon: number
}

/** Used when a site has no location yet: Delhi. Always labelled as a default in the UI. */
export const DEFAULT_LOCATION: SiteLocation = { lat: 28.6, lon: 77.2 }

export interface Site {
  /** Simple polygon, at least 3 points, either winding. */
  boundary: SitePoint[]
  rules: SiteRules
  /** Absent on sites saved before P5 (the default location applies). */
  location?: SiteLocation
}

export interface Mass {
  id: string
  name: string
  /** Simple polygon footprint on the ground, at least 3 points. */
  footprint: SitePoint[]
  floors: number
  floorHeightM: number
  /** Height of the mass's underside above ground (0 = on the ground). */
  baseM: number
  /** Use of each floor, ground floor first; missing floors are residential. */
  uses?: FloorUse[]
}

/** What a floor of a mass is for (Arcol-style programme per floor). */
export type FloorUse = 'residential' | 'retail' | 'office' | 'amenity' | 'parking'
export const FLOOR_USES: FloorUse[] = ['residential', 'retail', 'office', 'amenity', 'parking']
export const FLOOR_USE_LABEL: Record<FloorUse, string> = {
  residential: 'Residential', retail: 'Retail', office: 'Office', amenity: 'Amenity', parking: 'Parking',
}

/** The use of floor `index` (0 = ground) of a mass. */
export const floorUse = (mass: Pick<Mass, 'uses'>, index: number): FloorUse => mass.uses?.[index] ?? 'residential'

/**
 * Runs of consecutive floors with the same use, bottom first:
 * [{ use, from, to }] with 0-based inclusive floor indices.
 */
export function useBands(mass: Pick<Mass, 'uses' | 'floors'>): { use: FloorUse; from: number; to: number }[] {
  const bands: { use: FloorUse; from: number; to: number }[] = []
  for (let i = 0; i < mass.floors; i++) {
    const use = floorUse(mass, i)
    const last = bands[bands.length - 1]
    if (last && last.use === use) last.to = i
    else bands.push({ use, from: i, to: i })
  }
  return bands
}

/** The mass with floors `from..to` (inclusive, 0-based) set to `use`. */
export function withFloorUse(mass: Mass, from: number, to: number, use: FloorUse): Mass {
  const uses = Array.from({ length: mass.floors }, (_, i) => floorUse(mass, i))
  for (let i = Math.max(0, from); i <= Math.min(mass.floors - 1, to); i++) uses[i] = use
  return { ...mass, uses: uses.every((u) => u === 'residential') ? undefined : uses }
}

export const DEFAULT_FLOOR_HEIGHT_M = 3.2

export const emptyRules = (edges: number): SiteRules => ({
  setbacks: Array.from({ length: edges }, () => 0),
  maxHeightM: null,
  maxCoverage: null,
  maxFar: null,
})

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const points = (value: unknown): SitePoint[] | null => {
  if (!Array.isArray(value)) return null
  const out: SitePoint[] = []
  for (const point of value) {
    const x = num((point as SitePoint)?.x)
    const z = num((point as SitePoint)?.z)
    if (x === null || z === null) return null
    out.push({ x, z })
  }
  return out.length >= 3 ? out : null
}

/** A valid latitude/longitude, or null. */
export function parseLocation(value: unknown): SiteLocation | null {
  const lat = num((value as SiteLocation | null)?.lat)
  const lon = num((value as SiteLocation | null)?.lon)
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

/** Read `layoutMetadata.site` defensively; anything malformed is null. */
export function parseSite(value: unknown): Site | null {
  const boundary = points((value as Site | null)?.boundary)
  if (!boundary) return null
  const rules = (value as Site).rules ?? ({} as SiteRules)
  const setbacks = Array.isArray(rules.setbacks) ? rules.setbacks.map((s) => Math.max(0, num(s) ?? 0)) : []
  const positive = (v: unknown) => {
    const n = num(v)
    return n !== null && n > 0 ? n : null
  }
  const location = parseLocation((value as Site).location)
  return {
    boundary,
    ...(location ? { location } : {}),
    rules: {
      setbacks: boundary.map((_, i) => setbacks[i] ?? 0),
      maxHeightM: positive(rules.maxHeightM),
      maxCoverage: positive(rules.maxCoverage),
      maxFar: positive(rules.maxFar),
    },
  }
}

/** Read `layoutMetadata.masses` defensively; malformed masses are dropped. */
export function parseMasses(value: unknown): Mass[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const mass = raw as Mass
    const footprint = points(mass?.footprint)
    if (!footprint || typeof mass.id !== 'string') return []
    return [{
      id: mass.id,
      name: typeof mass.name === 'string' && mass.name ? mass.name : 'Mass',
      footprint,
      floors: Math.max(1, Math.round(num(mass.floors) ?? 1)),
      floorHeightM: Math.max(2, num(mass.floorHeightM) ?? DEFAULT_FLOOR_HEIGHT_M),
      baseM: Math.max(0, num(mass.baseM) ?? 0),
      ...(Array.isArray(mass.uses) && mass.uses.length
        ? { uses: mass.uses.map((u) => (FLOOR_USES.includes(u) ? u : 'residential')) }
        : {}),
    }]
  })
}
