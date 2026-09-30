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

export interface Site {
  /** Simple polygon, at least 3 points, either winding. */
  boundary: SitePoint[]
  rules: SiteRules
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
  return {
    boundary,
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
    }]
  })
}
