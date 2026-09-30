import { describe, expect, it } from 'vitest'
import type { Room } from '../store/canvasStore'
import { buildSunScene, computeSunHours, prismTriangles, summarize, sunSamples } from './sunHours'
import type { Mass } from '../site/siteTypes'
import type { LayoutPlan } from '../types/contracts'
import { layoutPlanToCanvas } from '../services/mvpLayoutAdapter'
import { EXAMPLE } from '../constants/examplePlan'

const delhi = (date: string) => ({ lat: 28.6, lon: 77.2, date })
const rad = Math.PI / 180
const up = (n: number) => new Float32Array(Array.from({ length: n }, () => [0, 1, 0]).flat())
const block = (x0: number, z0: number, x1: number, z1: number, h: number) =>
  new Float32Array(prismTriangles([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }], 0, h))

/** Hours with the sun at least `minAlt` high, from the sunrise equation. */
function dayAbove(latDeg: number, declDeg: number, minAlt: number) {
  const [lat, d] = [latDeg * rad, declDeg * rad]
  const cosH = (Math.sin(minAlt * rad) - Math.sin(lat) * Math.sin(d)) / (Math.cos(lat) * Math.cos(d))
  return (2 * Math.acos(cosH)) / rad / 15
}

describe('sun hours', () => {
  it('an unobstructed point gets the full day (above 3°)', () => {
    for (const [date, decl] of [['2026-06-21', 23.44], ['2026-12-21', -23.44], ['2026-03-20', 0]] as const) {
      const samples = sunSamples(delhi(date))
      const [h] = computeSunHours(new Float32Array(), new Float32Array([0, 0, 0]), up(1), samples)
      expect(Math.abs(h - dayAbove(28.6, decl, 3))).toBeLessThanOrEqual(0.25)
    }
  })

  it('a point just north of a tall block in winter gets no sun around noon', () => {
    // 20 m tall block from z = 0 to 10; the point is 5 m north of it (z = -5).
    // Dec noon at 28.6°N: 38° high -> the shadow reaches 25 m north.
    const tris = block(-20, 0, 20, 10, 20)
    const noon = sunSamples(delhi('2026-12-21')).slice(0, 8) // samples run outward from noon: 11:00-13:00
    const [h] = computeSunHours(tris, new Float32Array([0, 0.02, -5]), up(1), noon)
    expect(h).toBe(0)
    // The same point south of the block is in full sun.
    const [south] = computeSunHours(tris, new Float32Array([0, 0.02, 15]), up(1), noon)
    expect(south).toBeCloseTo(noon.length * 0.25)
  })

  it('is symmetric east-west about solar noon', () => {
    const tris = block(-2, -2, 2, 2, 10)
    const samples = sunSamples(delhi('2026-03-20'))
    const [east, west] = computeSunHours(tris, new Float32Array([6, 0.02, 0, -6, 0.02, 0]), up(2), samples)
    expect(east).toBeCloseTo(west, 5)
    expect(east).toBeGreaterThan(0)
  })

  it('matches a hand-computed wall shadow within 10%', () => {
    // A long east-west wall, 5 m high, along z = 0; the point is 10 m north,
    // Dec 21 at 28.6°N (decl -23.44°). The point is lit while the sun's
    // profile angle in the north-south plane is above atan(5 / 10):
    //   sin(alt) / south = (sinφ sinδ + cosφ cosδ cosH) / (sinφ cosδ cosH - cosφ sinδ) > 0.5
    //   (0.8056 - 0.2196) cosH > 0.1904 + 0.1747  =>  cosH > 0.623  =>  |H| < 51.46°
    // so lit for 2 x 51.46 / 15 = 6.86 h.
    const tris = block(-500, 0, 500, 0.2, 5)
    const [h] = computeSunHours(tris, new Float32Array([0, 0.02, -10]), up(1), sunSamples(delhi('2026-12-21')))
    expect(Math.abs(h - 6.86) / 6.86).toBeLessThan(0.1)
  })

  it('façades only see the sun in front of them', () => {
    const samples = sunSamples(delhi('2026-12-21'))
    const [north, south] = computeSunHours(new Float32Array(), new Float32Array([0, 1, 0, 0, 1, 0]), new Float32Array([0, 0, -1, 0, 0, 1]), samples)
    expect(north).toBe(0) // winter, 28.6°N: the sun never gets north of east-west
    expect(south).toBeGreaterThan(9)
  })
})

describe('buildSunScene', () => {
  const room = (id: string, roomType: string, x: number, z: number, w: number, d: number): Room => ({
    id, label: id, roomType, objectType: 'room', floorLevel: 0, color: '#fff',
    position: { x, y: 1.5, z }, size: { w, h: 3, d }, rotation: { x: 0, y: 0, z: 0 },
  })
  const wall = (id: string, x: number, z: number, w: number, d: number): Room => ({
    id, label: id, objectType: 'wall', floorLevel: 0, color: '#fff',
    position: { x, y: 1.5, z }, size: { w, h: 3, d }, rotation: { x: 0, y: 0, z: 0 },
  })

  it('samples ground, exterior-wall façades, masses and habitable windows; covered ground is NaN', () => {
    // A 4 x 4 bedroom at the origin with a south window, and a mass east of it.
    const objects: Room[] = [
      room('bed', 'bedroom', 0, 0, 4, 4),
      wall('s', 0, 2, 4, 0.2), wall('n', 0, -2, 4, 0.2), wall('e', 2, 0, 0.2, 4), wall('w', -2, 0, 0.2, 4),
      { ...wall('win', 0, 2, 1.2, 0.2), objectType: 'window', hostWallId: 's', position: { x: 0, y: 1.5, z: 2 }, size: { w: 1.2, h: 1.2, d: 0.2 } },
    ]
    const mass: Mass = { id: 'm', name: 'M', footprint: [{ x: 10, z: -5 }, { x: 20, z: -5 }, { x: 20, z: 5 }, { x: 10, z: 5 }], floors: 2, floorHeightM: 3, baseM: 0 }
    const scene = buildSunScene({ objects, masses: [mass], site: null })
    expect(scene.groundStep).toBe(1)
    expect(scene.facadeCount).toBe(40 * 2 + 16) // mass: 40 m perimeter x 2 floors; 4 walls x 4 m
    expect(scene.windows).toHaveLength(1)
    const winPoint = scene.positions.slice(scene.windows[0].index * 3, scene.windows[0].index * 3 + 3)
    expect(winPoint[2]).toBeGreaterThan(2.1) // outside the south wall

    const samples = sunSamples(delhi('2026-12-21'))
    const hours = computeSunHours(scene.triangles, scene.positions, scene.normals, samples)
    const summary = summarize(scene, hours, samples)
    expect(summary.rooms).toEqual([{ id: 'bed', label: 'bed', hours: expect.any(Number) }])
    expect(summary.rooms[0].hours).toBeGreaterThan(8) // south window, open south
    // Ground under the mass is built on.
    const under = Array.from({ length: scene.groundCount }, (_, i) => i).find((i) => scene.positions[i * 3] > 14 && scene.positions[i * 3] < 16 && Math.abs(scene.positions[i * 3 + 2]) < 1)!
    expect(hours[under]).toBeNaN()
    expect(summary.groundAtLeast2).toBeGreaterThan(0.5)
  })
})

describe('example villa + a 40 x 15 x 5-floor mass', () => {
  it('builds and runs well inside the 10 s budget', () => {
    const layout = layoutPlanToCanvas(EXAMPLE.plan as unknown as LayoutPlan)
    const { plot } = EXAMPLE.plan
    const mass: Mass = {
      id: 'm', name: 'Block', floors: 5, floorHeightM: 3.2, baseM: 0,
      footprint: [{ x: -45, z: -20 }, { x: -5, z: -20 }, { x: -5, z: -5 }, { x: -45, z: -5 }],
    }
    const site = { boundary: [{ x: -50, z: -25 }, { x: plot.width_m + 5, z: -25 }, { x: plot.width_m + 5, z: plot.depth_m + 5 }, { x: -50, z: plot.depth_m + 5 }], rules: { setbacks: [0, 0, 0, 0], maxHeightM: null, maxCoverage: null, maxFar: null } }
    const t0 = performance.now()
    const scene = buildSunScene({ objects: layout.rooms, masses: [mass], site })
    const samples = sunSamples(delhi('2026-12-21'))
    const hours = computeSunHours(scene.triangles, scene.positions, scene.normals, samples)
    const ms = performance.now() - t0
    const summary = summarize(scene, hours, samples)
    console.info(`villa+mass: ${scene.triangles.length / 9} tris, ${scene.groundCount} ground + ${scene.facadeCount} façade + ${scene.windows.length} window points, ${samples.length} sun samples, ${Math.round(ms)} ms`, summary.rooms)
    expect(ms).toBeLessThan(10000)
    expect(summary.rooms.length).toBeGreaterThanOrEqual(4)
    expect(summary.rooms.filter((r) => r.hours !== null).length).toBeGreaterThanOrEqual(3)
  }, 20000)
})
