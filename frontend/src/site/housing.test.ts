import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import {
  buildFillRequest,
  facingFrom,
  isHousingStale,
  mixPct,
  mixRows,
  normaliseMix,
  parseHousing,
  toggleUnitLock,
} from './housing'
import { FIXTURE_REQUEST, fixtureHousing, mockHousingFill } from './housingFixture'
import type { Mass } from './siteTypes'

const mass: Mass = {
  id: 'm1',
  name: 'Block',
  footprint: [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 15 }, { x: 0, z: 15 }],
  floors: 5,
  floorHeightM: 3.2,
  baseM: 0,
}

describe('buildFillRequest', () => {
  it('maps {x, z} to {x, y} and passes floors, height, corridor and facing', () => {
    const req = buildFillRequest({ ...mass, footprint: [{ x: 1, z: 2 }, { x: 5, z: 2 }, { x: 5, z: 9 }] }, {
      mixPct: { studio: 0, '1bhk': 50, '2bhk': 50, '3bhk': 0, '4bhk': 0 },
      corridorM: 1.8,
      facing: 'east',
    })
    expect(req.footprint).toEqual([{ x: 1, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 9 }])
    expect(req).toMatchObject({ floors: 5, floor_height_m: 3.2, corridor_width_m: 1.8, facing: 'east', locked_units: [] })
  })

  it('normalises the mix to shares and drops zero rows', () => {
    expect(normaliseMix({ studio: 20, '1bhk': 0, '2bhk': 60, '3bhk': 20, '4bhk': 0 })).toEqual([
      { unit_type: 'studio', share: 0.2 },
      { unit_type: '2bhk', share: 0.6 },
      { unit_type: '3bhk', share: 0.2 },
    ])
    // Not summing to 100 still gives shares summing to 1.
    const shares = normaliseMix({ studio: 1, '1bhk': 1, '2bhk': 2, '3bhk': 0, '4bhk': 0 }).map((e) => e.share)
    expect(shares.reduce((a, b) => a + b)).toBeCloseTo(1)
    expect(mixPct(FIXTURE_REQUEST.mix)).toEqual({ studio: 40, '1bhk': 35, '2bhk': 20, '3bhk': 5, '4bhk': 0 })
  })

  it('sends only locked units that still fit under the top floor', () => {
    const units = fixtureHousing().result.units
    const locked = [{ ...units[0], locked: true }, { ...units[units.length - 1], locked: true }, units[1]]
    const req = buildFillRequest({ ...mass, floors: 3 }, { mixPct: mixPct(undefined), corridorM: 1.5, facing: null, locked })
    expect(req.locked_units!.map((u) => u.id)).toEqual([units[0].id])
  })

  it('reads the street side from the brief', () => {
    expect(facingFrom({ mvpRequirements: { facing: 'west' } })).toBe('west')
    expect(facingFrom({})).toBeNull()
  })
})

describe('isHousingStale', () => {
  const housing = { request: buildFillRequest(mass, { mixPct: mixPct(undefined), corridorM: 1.5, facing: null }), result: fixtureHousing().result }
  it('is fresh for the same mass, and ignores name / base changes', () => {
    expect(isHousingStale(housing, mass)).toBe(false)
    expect(isHousingStale(housing, { ...mass, name: 'X', baseM: 4 })).toBe(false)
  })
  it('is out of date when the footprint, floors or floor height change', () => {
    expect(isHousingStale(housing, { ...mass, floors: 6 })).toBe(true)
    expect(isHousingStale(housing, { ...mass, floorHeightM: 3.5 })).toBe(true)
    expect(isHousingStale(housing, { ...mass, footprint: mass.footprint.map((p) => ({ ...p, x: p.x + 1 })) })).toBe(true)
  })
})

describe('fixture and yield', () => {
  it('fills 40 x 15 m, 5 floors with ~18 units a floor', () => {
    const { result } = fixtureHousing()
    expect(result.yield.total_units).toBe(result.units.length)
    expect(result.units.length / 5).toBeGreaterThanOrEqual(17)
    expect(result.yield.efficiency).toBeGreaterThan(0.7)
    expect(result.units.every((u) => u.plan.rooms.length >= 3)).toBe(true)
  })

  it('flags mix drift over 5 points', () => {
    const housing = fixtureHousing()
    const drifted = { ...housing, result: { ...housing.result, yield: { ...housing.result.yield, mix_achieved: { studio: 0.4, '1bhk': 0.28, '2bhk': 0.32, '3bhk': 0 } } } }
    const status = Object.fromEntries(mixRows(drifted).map((r) => [r.type, r.status]))
    expect(status).toEqual({ studio: 'ok', '1bhk': 'near', '2bhk': 'over', '3bhk': 'ok' })
  })
})

describe('locks', () => {
  it('toggles one unit and the mock keeps locked ids locked on re-solve', () => {
    const housing = fixtureHousing()
    const id = housing.result.units[3].id
    const locked = toggleUnitLock(housing, id)
    expect(locked.result.units.filter((u) => u.locked).map((u) => u.id)).toEqual([id])
    expect(toggleUnitLock(locked, id).result.units.some((u) => u.locked)).toBe(false)
    const again = mockHousingFill({ ...FIXTURE_REQUEST, locked_units: [locked.result.units[3]] })
    expect(again.units.find((u) => u.id === id)?.locked).toBe(true)
  })
})

describe('setHousing', () => {
  beforeEach(() => useCanvasStore.getState().loadLayout({ version: '1.0', rooms: [] }))

  it('stores housing per mass, saves it, and undoes it', () => {
    const housing = fixtureHousing()
    const { setHousing } = useCanvasStore.getState()
    setHousing('m1', housing)
    expect(parseHousing(useCanvasStore.getState().layoutMetadata.housing).m1.result.units).toHaveLength(housing.result.units.length)
    expect(useCanvasStore.getState().serializeLayout().metadata?.housing).toBeTruthy()
    setHousing('m1', toggleUnitLock(housing, housing.result.units[0].id))
    useCanvasStore.getState().undo()
    expect(parseHousing(useCanvasStore.getState().layoutMetadata.housing).m1.result.units[0].locked).toBe(false)
    useCanvasStore.getState().undo()
    expect(parseHousing(useCanvasStore.getState().layoutMetadata.housing)).toEqual({})
    useCanvasStore.getState().redo()
    expect(parseHousing(useCanvasStore.getState().layoutMetadata.housing).m1).toBeTruthy()
    setHousing('m1', null)
    expect(parseHousing(useCanvasStore.getState().layoutMetadata.housing)).toEqual({})
  })
})
