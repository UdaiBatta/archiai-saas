/**
 * GeoJSON site import: the largest polygon's outer ring, in local plan metres
 * (x east, z south, north = -z), min corner at the origin.
 */
import { polygonArea } from './siteGeometry'
import type { SitePoint } from './siteTypes'

type Position = number[]
type Ring = Position[]

const EARTH_RADIUS_M = 6_371_008.8

/** Outer rings of every Polygon / MultiPolygon in a geometry, Feature or FeatureCollection. */
function outerRingsOf(value: unknown): Ring[] {
  const node = value as { type?: string; coordinates?: unknown; geometry?: unknown; features?: unknown[]; geometries?: unknown[] }
  switch (node?.type) {
    case 'FeatureCollection':
      return (node.features ?? []).flatMap(outerRingsOf)
    case 'Feature':
      return outerRingsOf(node.geometry)
    case 'GeometryCollection':
      return (node.geometries ?? []).flatMap(outerRingsOf)
    case 'Polygon':
      return Array.isArray(node.coordinates) && node.coordinates.length ? [node.coordinates[0] as Ring] : []
    case 'MultiPolygon':
      return Array.isArray(node.coordinates) ? (node.coordinates as Ring[][]).map((polygon) => polygon[0]).filter(Boolean) : []
    default:
      return []
  }
}

const validRing = (ring: Ring): Ring | null => {
  if (!Array.isArray(ring)) return null
  const pts = ring.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
  if (pts.length !== ring.length) return null
  const last = pts[pts.length - 1]
  const open = pts.length > 1 && last[0] === pts[0][0] && last[1] === pts[0][1] ? pts.slice(0, -1) : pts
  return open.length >= 3 ? open : null
}

/** Degrees when every coordinate is a plausible lon/lat and the ring is small (< ~1 degree). */
export function looksLikeLonLat(ring: Ring): boolean {
  const lons = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  const inRange = lons.every((v) => Math.abs(v) <= 180) && lats.every((v) => Math.abs(v) <= 90)
  const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats))
  return inRange && span < 1
}

/** Equirectangular projection around the ring's centroid; north = -z. */
export function projectLonLat(ring: Ring): SitePoint[] {
  const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length
  const k = (Math.PI / 180) * EARTH_RADIUS_M
  const cos = Math.cos((lat0 * Math.PI) / 180)
  return ring.map(([lon, lat]) => ({ x: (lon - lon0) * k * cos, z: -(lat - lat0) * k }))
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** Shift so the min corner sits at the origin, rounded to millimetres. */
export function normaliseToOrigin(points: SitePoint[]): SitePoint[] {
  const minX = Math.min(...points.map((p) => p.x))
  const minZ = Math.min(...points.map((p) => p.z))
  return points.map((p) => ({ x: round3(p.x - minX), z: round3(p.z - minZ) }))
}

/** Site boundary from parsed GeoJSON; throws a readable Error when there is no polygon. */
export function boundaryFromGeoJson(json: unknown): SitePoint[] {
  const rings = outerRingsOf(json).map(validRing).filter((r): r is Ring => r !== null)
  if (!rings.length) throw new Error('No Polygon or MultiPolygon found in the GeoJSON')
  const toPlan = (ring: Ring) =>
    looksLikeLonLat(ring) ? projectLonLat(ring) : ring.map(([x, y]) => ({ x, z: -y }))
  const largest = rings.map(toPlan).reduce((a, b) => (polygonArea(b) > polygonArea(a) ? b : a))
  return normaliseToOrigin(largest)
}
