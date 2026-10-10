/**
 * Surrounding buildings (Site Atlas context), loaded from OpenStreetMap via
 * GET /api/site/context and stored in `layoutMetadata.siteContext`, so they
 * save with the project and work offline afterwards.
 *
 * The map point (the site's location) is placed at the site boundary's
 * centre. Buildings standing on the site itself are left out: the scheme
 * replaces them.
 */
import api from '../services/api'
import { polygonArea } from './siteGeometry'
import type { SiteLocation, SitePoint } from './siteTypes'

export interface ContextBuilding {
  footprint: SitePoint[]
  heightM: number
}

export interface SiteContext {
  buildings: ContextBuilding[]
  radiusM: number
  center: SiteLocation
  fetchedAt: string
}

export const OSM_CREDIT = '© OpenStreetMap contributors'

export function parseSiteContext(value: unknown): SiteContext | null {
  const raw = value as Partial<SiteContext> | null
  if (!raw || !Array.isArray(raw.buildings)) return null
  const buildings = raw.buildings.flatMap((b) => {
    const pts = Array.isArray(b?.footprint) ? b.footprint.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z)) : []
    const h = Number(b?.heightM)
    return pts.length >= 3 && h > 0 ? [{ footprint: pts.map((p) => ({ x: p.x, z: p.z })), heightM: h }] : []
  })
  return {
    buildings,
    radiusM: Number(raw.radiusM) || 250,
    center: raw.center ?? { lat: 0, lon: 0 },
    fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : '',
  }
}

const centroidOf = (points: SitePoint[]): SitePoint => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  z: points.reduce((s, p) => s + p.z, 0) / points.length,
})

export function insidePolygon(p: SitePoint, polygon: SitePoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** Map-relative buildings moved onto the site, minus those standing on it. */
export function placeOnSite(buildings: ContextBuilding[], boundary: SitePoint[]): ContextBuilding[] {
  const c = centroidOf(boundary)
  return buildings
    .map((b) => ({ ...b, footprint: b.footprint.map((p) => ({ x: p.x + c.x, z: p.z + c.z })) }))
    .filter((b) => polygonArea(b.footprint) > 4 && !insidePolygon(centroidOf(b.footprint), boundary))
}

export async function fetchSurroundings(location: SiteLocation, radiusM: number): Promise<ContextBuilding[]> {
  const { data } = await api.get<{ buildings: { footprint: SitePoint[]; height_m: number }[] }>('/api/site/context', {
    params: { lat: location.lat, lon: location.lon, radius: radiusM },
  })
  return data.buildings.map((b) => ({ footprint: b.footprint, heightM: b.height_m }))
}
