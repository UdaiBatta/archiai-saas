/**
 * Pure site-editing helpers: building a site from the plot, swapping a
 * boundary while keeping rules, edge-label placement and the street edge.
 */
import { edgeCardinals, parseOrientation, type ScreenEdge } from '../components/canvas/orientationModel'
import { signedArea } from './siteGeometry'
import { emptyRules, type Site, type SitePoint } from './siteTypes'

export interface PlotRect {
  x: number
  z: number
  w: number
  d: number
}

/**
 * The plot as a site: the engine's polygon boundary when there is one
 * (`mvpRequirements.plot.boundary`, NW origin, y = south), else the floor
 * footprint rectangle.
 */
export function plotBoundary(metadata: Record<string, unknown>, footprint: PlotRect | undefined): SitePoint[] | null {
  const plot = (metadata.mvpRequirements as { plot?: { boundary?: unknown } } | undefined)?.plot
  const polygon = Array.isArray(plot?.boundary) ? (plot.boundary as { x: unknown; y: unknown }[]) : null
  if (polygon && polygon.length >= 3 && polygon.every((v) => Number.isFinite(v?.x) && Number.isFinite(v?.y))) {
    return polygon.map((v) => ({ x: v.x as number, z: v.y as number }))
  }
  if (!footprint || !(footprint.w > 0) || !(footprint.d > 0)) return null
  const { x, z, w, d } = footprint
  return [{ x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d }]
}

/** A new boundary for the site; rules survive when the edge count matches. */
export function withBoundary(current: Site | null, boundary: SitePoint[]): Site {
  const keep = current && current.boundary.length === boundary.length
  const rules = keep ? current.rules : emptyRules(boundary.length)
  return current?.location ? { boundary, rules, location: current.location } : { boundary, rules }
}

export const edgeLength = (boundary: SitePoint[], index: number) => {
  const a = boundary[index]
  const b = boundary[(index + 1) % boundary.length]
  return Math.hypot(b.x - a.x, b.z - a.z)
}

/** Unit normal of edge `index` pointing out of the site (either winding). */
export function outwardNormal(boundary: SitePoint[], index: number): SitePoint {
  const a = boundary[index]
  const b = boundary[(index + 1) % boundary.length]
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1
  const inward = signedArea(boundary) > 0 ? 1 : -1
  // Matches buildableEnvelope: (-uz, ux) * inward points inside.
  return { x: ((b.z - a.z) / len) * inward, z: (-(b.x - a.x) / len) * inward }
}

export interface EdgeLabel {
  index: number
  /** Where the label sits: inside the site, in the middle of the setback strip. */
  point: SitePoint
  text: string
}

/** One label per edge, at the edge midpoint pushed inward by half the setback (min `minOffset`). */
export function edgeLabels(site: Site, minOffset = 0.8): EdgeLabel[] {
  const { boundary, rules } = site
  return boundary.map((a, index) => {
    const b = boundary[(index + 1) % boundary.length]
    const setback = rules.setbacks[index] ?? 0
    const n = outwardNormal(boundary, index)
    const depth = Math.max(setback / 2, minOffset)
    return {
      index,
      point: { x: (a.x + b.x) / 2 - n.x * depth, z: (a.z + b.z) / 2 - n.z * depth },
      text: `${setback.toFixed(1)} m`,
    }
  })
}

/** The edge whose outward normal best faces `direction` (e.g. the street side), or null. */
export function frontEdgeIndex(boundary: SitePoint[], direction: SitePoint | null): number | null {
  if (!direction) return null
  let best: number | null = null
  let bestDot = 0.5 // must face within ~60 degrees
  boundary.forEach((_, index) => {
    const n = outwardNormal(boundary, index)
    const dot = n.x * direction.x + n.z * direction.z
    if (dot > bestDot) {
      bestDot = dot
      best = index
    }
  })
  return best
}

export const moveCorner = (site: Site, index: number, point: SitePoint): Site => ({
  ...site,
  boundary: site.boundary.map((p, i) => (i === index ? point : p)),
})

const SCREEN_OUTWARD: Record<ScreenEdge, SitePoint> = {
  top: { x: 0, z: -1 },
  bottom: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
}
const FACING_OUTWARD: Record<string, SitePoint> = {
  north: SCREEN_OUTWARD.top,
  south: SCREEN_OUTWARD.bottom,
  west: SCREEN_OUTWARD.left,
  east: SCREEN_OUTWARD.right,
}

/**
 * Plan direction the front (street) faces: from the generator's orientation
 * block (same screen-edge mapping as the plan labels), else the brief's
 * `facing` with north = -z.
 */
export function streetDirection(metadata: Record<string, unknown>): SitePoint | null {
  const orientation = parseOrientation(metadata)
  if (orientation) {
    const facing = orientation.facingDirection ?? orientation.entrySide
    const cardinals = edgeCardinals(orientation)
    const edge = (Object.keys(cardinals) as ScreenEdge[]).find((e) => cardinals[e] === facing)
    if (edge) return SCREEN_OUTWARD[edge]
  }
  const facing = (metadata.mvpRequirements as { facing?: unknown } | undefined)?.facing
  return typeof facing === 'string' ? FACING_OUTWARD[facing] ?? null : null
}
