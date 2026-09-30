import { describe, expect, it } from 'vitest'
import { boundaryFromGeoJson, looksLikeLonLat } from './geojson'
import { polygonArea } from './siteGeometry'

const bbox = (pts: { x: number; z: number }[]) => ({
  w: Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
  d: Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z)),
  minX: Math.min(...pts.map((p) => p.x)),
  minZ: Math.min(...pts.map((p) => p.z)),
})

describe('boundaryFromGeoJson', () => {
  it('treats large coordinates as metres, flips north to -z and drops the closing point', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[500000, 4000000], [500020, 4000000], [500020, 4000030], [500000, 4000030], [500000, 4000000]]] },
    }
    const pts = boundaryFromGeoJson(feature)
    expect(pts).toHaveLength(4)
    expect(bbox(pts)).toEqual({ w: 20, d: 30, minX: 0, minZ: 0 })
    // First corner is the south-west one: max z.
    expect(pts[0]).toEqual({ x: 0, z: 30 })
  })

  it('projects lon/lat to local metres', () => {
    // ~0.0001 deg of latitude is ~11.1 m; longitude shrinks by cos(lat).
    const lat = 51.5
    const ring = [[-0.1, lat], [-0.0998, lat], [-0.0998, lat + 0.0002], [-0.1, lat + 0.0002], [-0.1, lat]]
    expect(looksLikeLonLat(ring)).toBe(true)
    const pts = boundaryFromGeoJson({ type: 'Polygon', coordinates: [ring] })
    const box = bbox(pts)
    expect(box.d).toBeCloseTo(22.24, 1)
    expect(box.w).toBeCloseTo(0.0002 * 111195 * Math.cos((lat * Math.PI) / 180), 1)
    // North (higher latitude) is -z: the first corner (southern) sits at max z.
    expect(pts[0].z).toBeCloseTo(box.d, 3)
  })

  it('picks the largest polygon from a FeatureCollection with a MultiPolygon', () => {
    const square = (s: number, o = 0) => [[[o, o], [o + s, o], [o + s, o + s], [o, o + s], [o, o]]]
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [square(200, 1000), square(400, 5000)] } },
      ],
    }
    expect(polygonArea(boundaryFromGeoJson(fc))).toBeCloseTo(160000)
  })

  it('rejects GeoJSON without polygons', () => {
    expect(() => boundaryFromGeoJson({ type: 'Point', coordinates: [0, 0] })).toThrow(/Polygon/)
    expect(() => boundaryFromGeoJson(null)).toThrow()
  })
})
