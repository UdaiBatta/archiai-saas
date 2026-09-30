/**
 * A stand-in for POST /api/housing/fill, for development and tests: a
 * double-loaded corridor along the footprint's long (x) side, one core on the
 * north side, units chosen to follow the requested mix, simple unit plans.
 * Uses the footprint's bounding box only.
 */
import type { LayoutPlan, PlanRoom, Vertex } from '../types/contracts'
import type { HousingFillRequest, HousingFillResponse, HousingUnit, UnitType } from './housingTypes'
import { UNIT_TYPES } from './housingTypes'

const WIDTH: Record<UnitType, number> = { studio: 3, '1bhk': 4, '2bhk': 6, '3bhk': 7.2, '4bhk': 8.8 }
const FRONT_ROOMS: Record<UnitType, [string, string][]> = {
  studio: [['living_room', 'Studio']],
  '1bhk': [['living_room', 'Living'], ['bedroom', 'Bed']],
  '2bhk': [['living_room', 'Living'], ['master_bedroom', 'Bed 1'], ['bedroom', 'Bed 2']],
  '3bhk': [['living_room', 'Living'], ['master_bedroom', 'Bed 1'], ['bedroom', 'Bed 2'], ['bedroom', 'Bed 3']],
  '4bhk': [['living_room', 'Living'], ['master_bedroom', 'Bed 1'], ['bedroom', 'Bed 2'], ['bedroom', 'Bed 3'], ['bedroom', 'Bed 4']],
}
const CORE_W = 4

const rect = (x: number, y: number, w: number, h: number): Vertex[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]
const r2 = (v: number) => Math.round(v * 100) / 100

function unitPlan(id: string, type: UnitType, x: number, y: number, w: number, d: number, north: boolean, floor: number): LayoutPlan {
  const backD = Math.min(2.4, d * 0.4)
  const frontD = d - backD
  // Front (facade) row faces away from the corridor.
  const frontY = north ? y : y + backD
  const backY = north ? y + frontD : y
  const rooms: PlanRoom[] = []
  const front = FRONT_ROOMS[type]
  front.forEach(([rt, label], i) => {
    const fw = w / front.length
    rooms.push({ id: `${id}-f${i}`, type: rt, label, x: r2(x + i * fw), y: r2(frontY), w: r2(fw), h: r2(frontD), rotation: 0, floor })
  })
  const bathW = Math.min(1.8, w / 2)
  rooms.push({ id: `${id}-k`, type: 'kitchen', label: 'Kitchen', x: r2(x), y: r2(backY), w: r2(w - bathW), h: r2(backD), rotation: 0, floor })
  rooms.push({ id: `${id}-b`, type: 'bathroom', label: 'Bath', x: r2(x + w - bathW), y: r2(backY), w: r2(bathW), h: r2(backD), rotation: 0, floor })
  const [a, b, c, e] = rect(x, y, w, d)
  const walls = [[a, b], [b, c], [c, e], [e, a]].map(([p, q], i) => ({ id: `${id}-w${i}`, x1: r2(p.x), y1: r2(p.y), x2: r2(q.x), y2: r2(q.y), thickness: 0.2, floor }))
  return { plot: { width_m: r2(w), depth_m: r2(d), facing: north ? 'north' : 'south' }, rooms, walls, doors: [{ id: `${id}-d`, wall_ref: `${id}-w${north ? 2 : 0}`, offset: w / 2, width: 0.9, floor }] }
}

export function mockHousingFill(request: HousingFillRequest): HousingFillResponse {
  const xs = request.footprint.map((p) => p.x)
  const ys = request.footprint.map((p) => p.y)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const W = Math.max(...xs) - x0
  const D = Math.max(...ys) - y0
  const corridor = request.corridor_width_m ?? 1.5
  const depth = (D - corridor) / 2
  const shares = new Map(request.mix.map((m) => [m.unit_type, m.share]))
  const types = UNIT_TYPES.filter((t) => (shares.get(t) ?? 0) > 0)
  const cx = x0 + W / 2 - CORE_W / 2
  const segments: [number, number, boolean][] = [
    [x0, cx - x0, true],
    [cx + CORE_W, x0 + W - cx - CORE_W, true],
    [x0, W, false],
  ]
  const locked = new Set((request.locked_units ?? []).map((u) => u.id))
  const units: HousingUnit[] = []
  const counts = new Map<UnitType, number>()
  let placed = 0
  for (let floor = 0; floor < request.floors; floor++) {
    let n = 0
    for (const [sx, len, north] of segments) {
      let at = 0
      while (len - at >= WIDTH.studio) {
        // Largest shortfall against the target mix picks the next type.
        const fit = types.filter((t) => WIDTH[t] <= len - at)
        if (!fit.length) break
        const type = fit.reduce((best, t) =>
          (shares.get(t)! * (placed + 1) - (counts.get(t) ?? 0)) > (shares.get(best)! * (placed + 1) - (counts.get(best) ?? 0)) ? t : best)
        let w = WIDTH[type]
        if (len - at - w < WIDTH.studio) w = len - at // last one takes the remainder
        const id = `u${floor}-${n++}`
        const x = sx + at
        const y = north ? y0 : y0 + depth + corridor
        units.push({ id, floor, unit_type: type, outline: rect(r2(x), r2(y), r2(w), r2(depth)), area_m2: r2(w * depth), plan: unitPlan(id, type, x, y, w, depth, north, floor), locked: locked.has(id) })
        counts.set(type, (counts.get(type) ?? 0) + 1)
        placed++
        at += w
      }
    }
  }
  const gfa = W * D * request.floors
  const nsa = units.reduce((s, u) => s + u.area_m2, 0)
  const byType = Object.fromEntries(types.map((t) => [t, counts.get(t) ?? 0]))
  return {
    units,
    cores: [rect(r2(cx), y0, CORE_W, r2(depth))],
    corridors: [rect(x0, r2(y0 + depth), W, corridor)],
    yield: {
      total_units: units.length,
      units_by_type: byType,
      mix_achieved: Object.fromEntries(types.map((t) => [t, units.length ? (counts.get(t) ?? 0) / units.length : 0])),
      gfa_m2: r2(gfa),
      nsa_m2: r2(nsa),
      efficiency: gfa ? nsa / gfa : 0,
    },
    warnings: D < 12 ? ['Plate is shallow for a double-loaded corridor.'] : ['Mock solver: the real engine is not connected.'],
  }
}

/** The fixture used by tests and the dev harness: a 40 x 15 m, 5-floor mass. */
export const FIXTURE_REQUEST: HousingFillRequest = {
  footprint: rect(0, 0, 40, 15),
  floors: 5,
  floor_height_m: 3.2,
  mix: [
    { unit_type: 'studio', share: 0.4 },
    { unit_type: '1bhk', share: 0.35 },
    { unit_type: '2bhk', share: 0.2 },
    { unit_type: '3bhk', share: 0.05 },
  ],
  facing: 'south',
  corridor_width_m: 1.5,
  locked_units: [],
}
export const fixtureHousing = () => ({ request: FIXTURE_REQUEST, result: mockHousingFill(FIXTURE_REQUEST) })
