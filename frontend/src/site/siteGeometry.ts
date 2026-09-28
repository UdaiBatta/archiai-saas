/**
 * Plan geometry for sites and masses (x east, z south, metres). Boolean
 * operations go through polygon-clipping, so concave sites and overlapping
 * masses are handled exactly.
 */
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping'
import type { Mass, Site, SitePoint } from './siteTypes'

/** A region: a list of polygons, each outer ring first, then holes. */
export type Region = MultiPolygon

const EPS = 1e-9

// Snap to a micrometre grid: polygon-clipping fails ("Unable to complete
// output ring") on float noise where skewed setback strips cross.
const q = (v: number) => Math.round(v * 1e6) / 1e6

const ring = (points: SitePoint[]): [number, number][] => {
  const coords = points.map((p) => [q(p.x), q(p.z)] as [number, number])
  return [...coords, coords[0]]
}

export const polygonOf = (points: SitePoint[]): Polygon => [ring(points)]

/** Signed area; positive when the points run clockwise on screen (x right, z down). */
export function signedArea(points: SitePoint[]): number {
  let sum = 0
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]
    sum += a.x * b.z - b.x * a.z
  })
  return sum / 2
}

export const polygonArea = (points: SitePoint[]) => Math.abs(signedArea(points))

const ringArea = (r: [number, number][]) => {
  let sum = 0
  for (let i = 0; i < r.length - 1; i++) sum += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return Math.abs(sum) / 2
}

/** Area of a region (outer rings minus holes). */
export const regionArea = (region: Region) =>
  region.reduce((total, [outer, ...holes]) => total + ringArea(outer) - holes.reduce((h, r) => h + ringArea(r), 0), 0)

/**
 * The buildable envelope: the site minus a strip along each boundary edge as
 * deep as that edge's setback (measured square to the edge). Empty when the
 * setbacks swallow the site.
 */
export function buildableEnvelope(site: Site): Region {
  const pts = site.boundary
  const inward = signedArea(pts) > 0 ? 1 : -1 // left normal points inside for clockwise rings
  const strips: Polygon[] = []
  pts.forEach((a, i) => {
    const depth = site.rules.setbacks[i] ?? 0
    if (depth <= EPS) return
    const b = pts[(i + 1) % pts.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    if (len <= EPS) return
    const ux = (b.x - a.x) / len
    const uz = (b.z - a.z) / len
    const nx = -uz * inward
    const nz = ux * inward
    // Stretch past both ends so neighbouring strips overlap at the corners.
    const ext = depth
    const a0 = { x: a.x - ux * ext, z: a.z - uz * ext }
    const b0 = { x: b.x + ux * ext, z: b.z + uz * ext }
    strips.push(polygonOf([
      a0,
      b0,
      { x: b0.x + nx * depth, z: b0.z + nz * depth },
      { x: a0.x + nx * depth, z: a0.z + nz * depth },
    ]))
  })
  const site_ = polygonOf(pts)
  return strips.length ? polygonClipping.difference(site_, ...strips) : [site_]
}

/** Union of mass footprints (overlaps counted once). */
export function footprintUnion(masses: Mass[]): Region {
  if (!masses.length) return []
  const [first, ...rest] = masses.map((m) => polygonOf(m.footprint))
  return polygonClipping.union(first, ...rest)
}

export const intersect = (a: Region | Polygon, b: Region | Polygon): Region => polygonClipping.intersection(a, b)
export const subtract = (a: Region | Polygon, b: Region | Polygon): Region => polygonClipping.difference(a, b)

/** Area of `points` lying outside `region` (0 when fully inside). */
export const areaOutside = (points: SitePoint[], region: Region) =>
  region.length ? regionArea(subtract(polygonOf(points), region)) : polygonArea(points)

/** A region's polygons as point lists (outer rings only; holes dropped). */
export const outerRings = (region: Region): SitePoint[][] =>
  region.map(([outer]) => outer.slice(0, -1).map(([x, z]) => ({ x, z })))
