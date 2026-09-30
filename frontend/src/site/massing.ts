/**
 * Massing logic (P2): live site metrics, zoning issues with one-click fixes,
 * and the pure edits behind the 3D / Top view gestures. No React, no store.
 */
import {
  buildableEnvelope,
  footprintUnion,
  intersect,
  outerRings,
  polygonArea,
  polygonOf,
  regionArea,
  subtract,
  type Region,
} from './siteGeometry'
import { DEFAULT_FLOOR_HEIGHT_M, type Mass, type Site, type SitePoint } from './siteTypes'

/** Areas below this (m²) are treated as numerical noise. */
const AREA_EPS = 0.05
/** A metric at or above this share of its limit reads as "near". */
export const NEAR_LIMIT = 0.9
export const MAX_FLOORS = 200

export type MetricStatus = 'ok' | 'near' | 'over' | 'none'

export interface MetricRow {
  key: 'coverage' | 'far' | 'height'
  label: string
  value: number
  limit: number | null
  status: MetricStatus
}

export interface SiteMetrics {
  siteArea: number | null
  buildableArea: number | null
  footprintArea: number
  /** Footprint / site area, 0..1 (null without a site). */
  coverage: number | null
  gfa: number
  far: number | null
  maxHeightM: number
  maxFloors: number
  rows: MetricRow[]
}

export const massTop = (m: Mass) => m.baseM + m.floors * m.floorHeightM
export const massGfa = (m: Mass) => polygonArea(m.footprint) * m.floors
const totalGfa = (masses: Mass[]) => masses.reduce((sum, m) => sum + massGfa(m), 0)

export function statusOf(value: number, limit: number | null): MetricStatus {
  if (limit === null) return 'none'
  if (value > limit * (1 + 1e-6)) return 'over'
  return value >= limit * NEAR_LIMIT ? 'near' : 'ok'
}

export function siteMetrics(site: Site | null, masses: Mass[]): SiteMetrics {
  const siteArea = site ? polygonArea(site.boundary) : null
  const buildableArea = site ? regionArea(buildableEnvelope(site)) : null
  const footprintArea = regionArea(footprintUnion(masses))
  const gfa = totalGfa(masses)
  const coverage = siteArea ? footprintArea / siteArea : null
  const far = siteArea ? gfa / siteArea : null
  const maxHeightM = masses.reduce((h, m) => Math.max(h, massTop(m)), 0)
  const maxFloors = masses.reduce((f, m) => Math.max(f, m.floors), 0)
  const rules = site?.rules
  const row = (key: MetricRow['key'], label: string, value: number | null, limit: number | null | undefined): MetricRow[] =>
    value === null ? [] : [{ key, label, value, limit: limit ?? null, status: statusOf(value, limit ?? null) }]
  return {
    siteArea,
    buildableArea,
    footprintArea,
    coverage,
    gfa,
    far,
    maxHeightM,
    maxFloors,
    rows: [
      ...row('coverage', 'Coverage', coverage, rules?.maxCoverage),
      ...row('far', 'FAR', far, rules?.maxFar),
      ...row('height', 'Max height', maxHeightM, rules?.maxHeightM),
    ],
  }
}

// ---------------------------------------------------------------- issues

export type IssueCode = 'outside' | 'height' | 'coverage' | 'far' | 'overlap'

export interface ZoningIssue {
  code: IssueCode
  /** The offending mass; null for site-wide issues (coverage, FAR). */
  massId: string | null
  message: string
  /** One-click fix: a label and the full mass list after applying it. */
  fix?: { label: string; masses: Mass[] }
}

const fmtArea = (a: number) => `${a.toFixed(1)} m²`

/** Largest outer ring of a region, or null when it is empty. */
export function largestRing(region: Region): SitePoint[] | null {
  let best: SitePoint[] | null = null
  let bestArea = AREA_EPS
  for (const ring of outerRings(region)) {
    const area = polygonArea(ring)
    if (area > bestArea) {
      best = ring
      bestArea = area
    }
  }
  return best
}

const largestSimpleRing = (region: Region): SitePoint[] | null =>
  region.length === 1 && region[0].length === 1 ? largestRing(region) : null

const replace = (masses: Mass[], id: string, patch: Partial<Mass>) =>
  masses.map((m) => (m.id === id ? { ...m, ...patch } : m))

/** Floors that keep `mass` within `maxHeightM` (at least 1 - a mass never vanishes). */
export const floorsWithin = (mass: Mass, maxHeightM: number) =>
  Math.max(1, Math.floor((maxHeightM - mass.baseM) / mass.floorHeightM + 1e-9))

/**
 * Take floors off one at a time until the total GFA fits, stopping as soon
 * as it does. Each step picks the tallest mass (top height), and among
 * those the largest footprint (the biggest GFA cut per floor), then id.
 * Stops when every mass is down to one floor.
 */
export function reduceFloorsForGfa(masses: Mass[], maxGfa: number): Mass[] {
  const next = masses.map((m) => ({ ...m }))
  let gfa = totalGfa(next)
  while (gfa > maxGfa * (1 + 1e-9)) {
    const candidates = next.filter((m) => m.floors > 1)
    if (!candidates.length) break
    candidates.sort((a, b) => massTop(b) - massTop(a) || polygonArea(b.footprint) - polygonArea(a.footprint) || a.id.localeCompare(b.id))
    const target = candidates[0]
    target.floors -= 1
    gfa -= polygonArea(target.footprint)
  }
  return next
}

export function zoningIssues(site: Site | null, masses: Mass[]): ZoningIssue[] {
  const issues: ZoningIssue[] = []
  const envelope = site ? buildableEnvelope(site) : null
  const rules = site?.rules

  for (const m of masses) {
    if (envelope) {
      const spill = spillRegion(m, envelope)
      const spillArea = regionArea(spill)
      if (spillArea > AREA_EPS) {
        const trimmed = largestSimpleRing(intersect(polygonOf(m.footprint), envelope))
        issues.push({
          code: 'outside',
          massId: m.id,
          message: `${m.name} is ${fmtArea(spillArea)} outside the buildable envelope.`,
          fix: trimmed ? { label: 'Trim to envelope', masses: replace(masses, m.id, { footprint: trimmed }) } : undefined,
        })
      }
    }
    if (rules?.maxHeightM && massTop(m) > rules.maxHeightM + 1e-6) {
      const floors = floorsWithin(m, rules.maxHeightM)
      const fits = m.baseM + floors * m.floorHeightM <= rules.maxHeightM + 1e-6
      issues.push({
        code: 'height',
        massId: m.id,
        message: `${m.name} is ${massTop(m).toFixed(1)} m tall; the limit is ${rules.maxHeightM.toFixed(1)} m.`,
        fix: fits && floors < m.floors
          ? { label: `Reduce to ${floors} floor${floors === 1 ? '' : 's'}`, masses: replace(masses, m.id, { floors }) }
          : undefined,
      })
    }
  }

  const metrics = siteMetrics(site, masses)
  if (rules?.maxCoverage && metrics.coverage !== null && metrics.coverage > rules.maxCoverage * (1 + 1e-6)) {
    issues.push({
      code: 'coverage',
      massId: null,
      message: `Coverage is ${(metrics.coverage * 100).toFixed(1)}%; the limit is ${(rules.maxCoverage * 100).toFixed(1)}%. Shrink or remove footprints.`,
    })
  }
  if (rules?.maxFar && metrics.far !== null && metrics.siteArea && metrics.far > rules.maxFar * (1 + 1e-6)) {
    const fixed = reduceFloorsForGfa(masses, rules.maxFar * metrics.siteArea)
    const fits = totalGfa(fixed) <= rules.maxFar * metrics.siteArea * (1 + 1e-9)
    issues.push({
      code: 'far',
      massId: null,
      message: `FAR is ${metrics.far.toFixed(2)}; the limit is ${rules.maxFar.toFixed(2)}.`,
      fix: fits ? { label: 'Reduce floors on the tallest masses', masses: fixed } : undefined,
    })
  }

  for (let i = 0; i < masses.length; i++) {
    for (let j = i + 1; j < masses.length; j++) {
      const a = masses[i]
      const b = masses[j]
      const overlap = regionArea(intersect(polygonOf(a.footprint), polygonOf(b.footprint)))
      if (overlap <= AREA_EPS) continue
      const cut = largestSimpleRing(subtract(polygonOf(b.footprint), polygonOf(a.footprint)))
      issues.push({
        code: 'overlap',
        massId: b.id,
        message: `${b.name} overlaps ${a.name} by ${fmtArea(overlap)}.`,
        fix: cut ? { label: `Cut ${b.name} back from ${a.name}`, masses: replace(masses, b.id, { footprint: cut }) } : undefined,
      })
    }
  }
  return issues
}

/** Part of a mass's footprint outside the envelope (all of it when the envelope is empty). */
export const spillRegion = (m: Mass, envelope: Region): Region =>
  envelope.length ? subtract(polygonOf(m.footprint), envelope) : [polygonOf(m.footprint)]

// ---------------------------------------------------------------- edits

/** Push/pull: floors for a dragged top height, snapped to whole floors. */
export function floorsForTop(mass: Mass, topY: number): number {
  const floors = Math.round((topY - mass.baseM) / mass.floorHeightM)
  return Math.min(MAX_FLOORS, Math.max(1, floors))
}

export const snap = (value: number, grid: number, enabled = true) =>
  enabled && grid > 0 ? Math.round(value / grid) * grid : value

export const translateFootprint = (points: SitePoint[], dx: number, dz: number) =>
  points.map((p) => ({ x: p.x + dx, z: p.z + dz }))

/** Move a mass so its first corner lands on the grid (the rest follow rigidly). */
export function moveMass(start: Mass, dx: number, dz: number, grid: number, snapOn: boolean): SitePoint[] {
  const origin = start.footprint[0]
  const sx = snap(origin.x + dx, grid, snapOn) - origin.x
  const sz = snap(origin.z + dz, grid, snapOn) - origin.z
  return translateFootprint(start.footprint, sx, sz)
}

export function moveCorner(points: SitePoint[], index: number, to: SitePoint, grid: number, snapOn: boolean): SitePoint[] {
  return points.map((p, i) => (i === index ? { x: snap(to.x, grid, snapOn), z: snap(to.z, grid, snapOn) } : p))
}

export const rectPoints = (a: SitePoint, b: SitePoint): SitePoint[] => {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const z0 = Math.min(a.z, b.z)
  const z1 = Math.max(a.z, b.z)
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
}

export const newMassId = () => `mass-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function nextMassName(masses: Mass[]): string {
  const used = new Set(masses.map((m) => m.name))
  let n = masses.length + 1
  while (used.has(`Mass ${n}`)) n++
  return `Mass ${n}`
}

export function makeMass(masses: Mass[], footprint: SitePoint[], floors = 4): Mass {
  return {
    id: newMassId(),
    name: nextMassName(masses),
    footprint,
    floors,
    floorHeightM: DEFAULT_FLOOR_HEIGHT_M,
    baseM: 0,
  }
}

export interface PlotBounds {
  x: number
  z: number
  w: number
  d: number
}

/**
 * Footprint for "Add mass": a rectangle half the size of the envelope's
 * largest part (or of the plot when there is no site), centred on it and
 * clipped to the envelope so a concave site never gets a mass outside it.
 */
export function defaultMassFootprint(site: Site | null, plot: PlotBounds | null): SitePoint[] {
  const envelope = site ? buildableEnvelope(site) : null
  const ring = envelope ? largestRing(envelope) : null
  let box = plot ?? { x: -10, z: -10, w: 20, d: 20 }
  if (ring) {
    const xs = ring.map((p) => p.x)
    const zs = ring.map((p) => p.z)
    box = { x: Math.min(...xs), z: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
  }
  const cx = box.x + box.w / 2
  const cz = box.z + box.d / 2
  const rect = rectPoints({ x: cx - box.w / 4, z: cz - box.d / 4 }, { x: cx + box.w / 4, z: cz + box.d / 4 })
  if (!envelope || !ring) return rect
  return largestRing(intersect(polygonOf(rect), envelope)) ?? ring
}

/** "Fill envelope": one mass per envelope polygon. */
export function fillEnvelope(site: Site, masses: Mass[], floors = 4): Mass[] {
  const created: Mass[] = []
  const envelope = buildableEnvelope(site)
  for (const [outer, ...holes] of envelope) {
    if (holes.length) continue
    const ring = outerRings([[outer]])[0]
    if (polygonArea(ring) <= AREA_EPS) continue
    created.push(makeMass([...masses, ...created], ring, floors))
  }
  return created
}

export const duplicateMass = (masses: Mass[], m: Mass, offset = 2): Mass => ({
  ...makeMass(masses, translateFootprint(m.footprint, offset, offset), m.floors),
  floorHeightM: m.floorHeightM,
  baseM: m.baseM,
  name: `${m.name} copy`,
})

export const centroid = (points: SitePoint[]): SitePoint => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  z: points.reduce((s, p) => s + p.z, 0) / points.length,
})
