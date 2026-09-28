import { describe, expect, it } from 'vitest'
import { areaOutside, buildableEnvelope, footprintUnion, outerRings, polygonArea, regionArea } from './siteGeometry'
import { emptyRules, type Mass, type Site } from './siteTypes'

const rect = (x: number, z: number, w: number, d: number) => [
  { x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d },
]

const site = (boundary: Site['boundary'], setbacks: number[]): Site => ({
  boundary,
  rules: { ...emptyRules(boundary.length), setbacks },
})

const mass = (id: string, footprint: Mass['footprint']): Mass => ({ id, name: id, footprint, floors: 1, floorHeightM: 3, baseM: 0 })

describe('buildableEnvelope', () => {
  it('insets each edge by its own setback, in either winding', () => {
    // 20 x 30 site; front (north, z=0) 6 m, sides 1.5 m, rear 3 m.
    const env = buildableEnvelope(site(rect(0, 0, 20, 30), [6, 1.5, 3, 1.5]))
    expect(regionArea(env)).toBeCloseTo(17 * 21)
    const reversed = [...rect(0, 0, 20, 30)].reverse() // edges now: S, E, N, W
    expect(regionArea(buildableEnvelope(site(reversed, [3, 1.5, 6, 1.5])))).toBeCloseTo(17 * 21)
  })

  it('handles a concave (L-shaped) site', () => {
    const l = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 10, z: 10 }, { x: 10, z: 20 }, { x: 0, z: 20 }]
    const env = buildableEnvelope(site(l, [1, 1, 1, 1, 1, 1]))
    // L of 300 m2; a 1 m band everywhere leaves an L of 18x8 + 8x10.
    expect(regionArea(env)).toBeCloseTo(18 * 8 + 8 * 10)
  })

  it('is empty when the setbacks swallow the site', () => {
    expect(buildableEnvelope(site(rect(0, 0, 10, 10), [6, 6, 6, 6]))).toEqual([])
  })

  it('does not throw on skewed polygons (polygon-clipping float robustness)', () => {
    const skewed = [{ x: 2.262758595655229, z: 0.3472664495210456 }, { x: 19.58771874824688, z: 0.8422653111458848 }, { x: 21.072715332754733, z: 14.702233436641418 }, { x: 3.2527563186604667, z: 15.6922311598911 }]
    expect(regionArea(buildableEnvelope(site(skewed, [6, 1.5, 3, 1.5])))).toBeCloseTo(81.945, 2)
    let seed = 7
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let k = 0; k < 400; k++) {
      const n = 3 + Math.floor(rnd() * 5)
      const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.5
        const r = 8 + rnd() * 12
        return { x: 5 + Math.cos(a) * r, z: 3 + Math.sin(a) * r }
      })
      expect(() => buildableEnvelope(site(pts, pts.map(() => Math.round(rnd() * 12) / 2)))).not.toThrow()
    }
  })

  it('is the whole site with no setbacks', () => {
    expect(regionArea(buildableEnvelope(site(rect(0, 0, 10, 10), [0, 0, 0, 0])))).toBeCloseTo(100)
  })
})

describe('footprints', () => {
  it('counts overlapping masses once and measures what spills outside', () => {
    const masses = [mass('a', rect(0, 0, 10, 10)), mass('b', rect(5, 0, 10, 10))]
    expect(regionArea(footprintUnion(masses))).toBeCloseTo(150)
    const env = buildableEnvelope(site(rect(0, 0, 12, 12), [0, 0, 0, 0]))
    expect(areaOutside(rect(5, 0, 10, 10), env)).toBeCloseTo(30)
    expect(outerRings(env)).toHaveLength(1)
    expect(polygonArea(outerRings(env)[0])).toBeCloseTo(144)
  })
})
