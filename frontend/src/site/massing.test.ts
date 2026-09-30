import { describe, expect, it } from 'vitest'
import {
  defaultMassFootprint,
  fillEnvelope,
  floorsForTop,
  moveCorner,
  moveMass,
  reduceFloorsForGfa,
  siteMetrics,
  statusOf,
  zoningIssues,
} from './massing'
import { areaOutside, buildableEnvelope, polygonArea } from './siteGeometry'
import { emptyRules, type Mass, type Site, type SiteRules } from './siteTypes'

const rect = (x: number, z: number, w: number, d: number) => [
  { x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d },
]

// 40 x 50 site = 2000 m2, 5 m setback all round -> envelope 30 x 40 = 1200 m2.
const site = (rules: Partial<SiteRules> = {}): Site => ({
  boundary: rect(0, 0, 40, 50),
  rules: { ...emptyRules(4), setbacks: [5, 5, 5, 5], ...rules },
})

const mass = (id: string, footprint: Mass['footprint'], floors = 1, floorHeightM = 3, baseM = 0): Mass =>
  ({ id, name: id.toUpperCase(), footprint, floors, floorHeightM, baseM })

describe('siteMetrics', () => {
  it('measures site, envelope, union footprint, GFA and FAR', () => {
    const masses = [mass('a', rect(10, 10, 10, 10), 4), mass('b', rect(15, 10, 10, 10), 2)]
    const m = siteMetrics(site({ maxCoverage: 0.1, maxFar: 1, maxHeightM: 12 }), masses)
    expect(m.siteArea).toBeCloseTo(2000)
    expect(m.buildableArea).toBeCloseTo(1200)
    expect(m.footprintArea).toBeCloseTo(150) // overlap counted once
    expect(m.coverage).toBeCloseTo(0.075)
    expect(m.gfa).toBeCloseTo(400 + 200) // GFA counts each mass's floors
    expect(m.far).toBeCloseTo(0.3)
    expect(m.maxHeightM).toBeCloseTo(12)
    expect(m.maxFloors).toBe(4)
    expect(m.rows.map((r) => [r.key, r.status])).toEqual([['coverage', 'ok'], ['far', 'ok'], ['height', 'near']])
  })

  it('works without a site (no ratios)', () => {
    const m = siteMetrics(null, [mass('a', rect(0, 0, 10, 10), 3)])
    expect(m.siteArea).toBeNull()
    expect(m.coverage).toBeNull()
    expect(m.gfa).toBeCloseTo(300)
    expect(m.rows.map((r) => r.key)).toEqual(['height'])
    expect(m.rows[0].status).toBe('none')
  })

  it('classifies ok / near / over', () => {
    expect(statusOf(5, 10)).toBe('ok')
    expect(statusOf(9.5, 10)).toBe('near')
    expect(statusOf(10, 10)).toBe('near')
    expect(statusOf(10.5, 10)).toBe('over')
    expect(statusOf(10, null)).toBe('none')
  })

  it('stays fast enough for live updates', () => {
    const masses = Array.from({ length: 30 }, (_, i) => mass(`m${i}`, rect(5 + (i % 6) * 5, 5 + Math.floor(i / 6) * 8, 6, 6), 5))
    const t = performance.now()
    siteMetrics(site({ maxFar: 2 }), masses)
    zoningIssues(site({ maxFar: 2, maxHeightM: 10, maxCoverage: 0.3 }), masses)
    // Hosted runners vary substantially; this guards accidental blowups without
    // making a 100 ms wall-clock promise for a live geometry interaction.
    expect(performance.now() - t).toBeLessThan(250)
  })
})

describe('zoningIssues', () => {
  it('is empty for a compliant scheme', () => {
    expect(zoningIssues(site({ maxHeightM: 30, maxCoverage: 0.5, maxFar: 3 }), [mass('a', rect(10, 10, 10, 10), 3)])).toEqual([])
  })

  it('flags a mass outside the envelope and trims it with the fix', () => {
    const s = site()
    const issues = zoningIssues(s, [mass('a', rect(0, 10, 20, 10))])
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'outside', massId: 'a' })
    expect(issues[0].message).toContain('50.0 m²')
    const trimmed = issues[0].fix!.masses[0]
    expect(polygonArea(trimmed.footprint)).toBeCloseTo(150)
    expect(areaOutside(trimmed.footprint, buildableEnvelope(s))).toBeCloseTo(0)
  })

  it('flags over-height and reduces floors to fit', () => {
    const issues = zoningIssues(site({ maxHeightM: 10 }), [mass('a', rect(10, 10, 10, 10), 5, 3, 1)])
    expect(issues[0]).toMatchObject({ code: 'height', massId: 'a' })
    expect(issues[0].fix!.masses[0].floors).toBe(3) // 1 + 3 x 3 = 10
  })

  it('flags over-coverage (no automatic fix)', () => {
    const issues = zoningIssues(site({ maxCoverage: 0.05 }), [mass('a', rect(10, 10, 20, 10))])
    expect(issues.map((i) => i.code)).toEqual(['coverage'])
    expect(issues[0].massId).toBeNull()
    expect(issues[0].fix).toBeUndefined()
  })

  it('flags over-FAR and fixes it by trimming the tallest masses first', () => {
    // 100 m2 x 10 + 100 m2 x 6 = 1600 m2 on 2000 m2 -> FAR 0.8; limit 0.5 -> 1000 m2.
    const masses = [mass('a', rect(10, 10, 10, 10), 10), mass('b', rect(20, 25, 10, 10), 6)]
    const issues = zoningIssues(site({ maxFar: 0.5 }), masses)
    expect(issues.map((i) => i.code)).toEqual(['far'])
    const fixed = issues[0].fix!.masses
    expect(fixed.map((m) => m.floors)).toEqual([5, 5])
    expect(siteMetrics(site(), fixed).far).toBeLessThanOrEqual(0.5)
  })

  it('FAR fix is the smallest reduction that fits (no overshoot)', () => {
    // Equal-height masses of very different sizes: cutting the big one first
    // lands just under the limit instead of flattening everything.
    const masses = [
      mass('m1', rect(10, 10, 5, 10), 4),
      mass('m2', rect(10, 25, 4, 4), 4),
      mass('m3', rect(20, 10, 12, 30), 4),
    ]
    const limit = 0.7 // 1400 m2 of GFA against 1704 m2 drawn
    const fixed = zoningIssues(site({ maxFar: limit }), masses)[0].fix!.masses
    const far = siteMetrics(site(), fixed).far!
    expect(far).toBeLessThanOrEqual(limit)
    // Within one floor's worth of GFA of the limit: the last floor removed was needed.
    const largestFloor = Math.max(...masses.map((m) => polygonArea(m.footprint)))
    expect((limit - far) * 2000).toBeLessThan(largestFloor)
    expect(fixed.map((m) => m.floors)).toEqual([4, 4, 3])
  })

  it('reduceFloorsForGfa is deterministic and never drops below one floor', () => {
    const masses = [mass('b', rect(0, 0, 10, 10), 3), mass('a', rect(0, 0, 10, 10), 3)]
    // Tie on height and floors -> lowest id ('a') loses a floor first.
    expect(reduceFloorsForGfa(masses, 500).map((m) => [m.id, m.floors])).toEqual([['b', 3], ['a', 2]])
    expect(reduceFloorsForGfa(masses, 0).map((m) => m.floors)).toEqual([1, 1])
  })

  it('flags overlapping masses and cuts the later one back', () => {
    const masses = [mass('a', rect(10, 10, 10, 10)), mass('b', rect(15, 10, 10, 10))]
    const issues = zoningIssues(site(), masses)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'overlap', massId: 'b' })
    expect(polygonArea(issues[0].fix!.masses[1].footprint)).toBeCloseTo(50)
  })

  it('does not offer a lossy overlap fix for contained or split footprints', () => {
    const contained = zoningIssues(site(), [mass('a', rect(10, 10, 20, 20)), mass('b', rect(15, 15, 5, 5))])
    expect(contained.find((issue) => issue.code === 'overlap')?.fix).toBeUndefined()
    const split = zoningIssues(site(), [
      mass('a', rect(15, 10, 5, 20)),
      mass('b', rect(10, 15, 20, 5)),
    ])
    expect(split.find((issue) => issue.code === 'overlap')?.fix).toBeUndefined()
  })
})

describe('mass edits', () => {
  it('push/pull snaps to whole floors, at least one', () => {
    const m = mass('a', rect(0, 0, 10, 10), 4, 3, 1)
    expect(floorsForTop(m, 1 + 3 * 6.4)).toBe(6)
    expect(floorsForTop(m, 1 + 3 * 6.6)).toBe(7)
    expect(floorsForTop(m, -20)).toBe(1)
  })

  it('moves rigidly on the grid and snaps dragged corners', () => {
    const m = mass('a', rect(0.2, 0.2, 10, 10))
    const moved = moveMass(m, 2.2, 0.9, 0.5, true)
    expect(moved[0]).toEqual({ x: 2.5, z: 1 })
    expect(polygonArea(moved)).toBeCloseTo(100)
    expect(moveCorner(m.footprint, 2, { x: 12.26, z: 11.74 }, 0.5, true)[2]).toEqual({ x: 12.5, z: 11.5 })
    expect(moveCorner(m.footprint, 2, { x: 12.26, z: 11.74 }, 0.5, false)[2]).toEqual({ x: 12.26, z: 11.74 })
  })

  it('places a default mass inside the envelope, or on the plot without a site', () => {
    const s = site()
    const fp = defaultMassFootprint(s, null)
    expect(polygonArea(fp)).toBeCloseTo(15 * 20)
    expect(areaOutside(fp, buildableEnvelope(s))).toBeCloseTo(0)
    expect(polygonArea(defaultMassFootprint(null, { x: 0, z: 0, w: 12, d: 8 }))).toBeCloseTo(24)
  })

  it('fills each envelope polygon with a mass', () => {
    const one = fillEnvelope(site(), [], 3)
    expect(one).toHaveLength(1)
    expect(polygonArea(one[0].footprint)).toBeCloseTo(1200)
    expect(one[0].floors).toBe(3)
    // Two 20 m squares joined by a 2 m neck; 1.5 m setbacks close the neck.
    const dumbbell = [
      { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 9 }, { x: 30, z: 9 }, { x: 30, z: 0 }, { x: 50, z: 0 },
      { x: 50, z: 20 }, { x: 30, z: 20 }, { x: 30, z: 11 }, { x: 20, z: 11 }, { x: 20, z: 20 }, { x: 0, z: 20 },
    ]
    const two = fillEnvelope({ boundary: dumbbell, rules: { ...emptyRules(12), setbacks: Array(12).fill(1.5) } }, [])
    expect(two.map((m) => m.name)).toEqual(['Mass 1', 'Mass 2'])
    expect(two.reduce((a, m) => a + polygonArea(m.footprint), 0)).toBeCloseTo(2 * 17 * 17)
  })
})
