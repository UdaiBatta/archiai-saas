import { describe, expect, it } from 'vitest'
import { buildHousingModel, housingDrawCalls } from './housingGeometry'
import { FIXTURE_REQUEST, fixtureHousing, mockHousingFill } from './housingFixture'
import type { Mass } from './siteTypes'

const mass = (floors: number): Mass => ({
  id: 'm1', name: 'Block', floors, floorHeightM: 3.2, baseM: 0,
  footprint: [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 15 }, { x: 0, z: 15 }],
})
const closed = { floor: 'all' as const, top: false, pickedUnitId: null }

describe('buildHousingModel', () => {
  it('draws a 20-floor block of 360+ units in at most 5 draw calls', () => {
    const request = { ...FIXTURE_REQUEST, floors: 20 }
    const housing = { request, result: mockHousingFill(request) }
    expect(housing.result.units.length).toBeGreaterThan(340)
    const model = buildHousingModel(housing, mass(20), closed)
    expect(housingDrawCalls(model)).toBeLessThanOrEqual(5)
    // Every unit is pickable through the face -> unit map.
    expect(new Set(model.unitOwners.filter(Boolean)).size).toBe(housing.result.units.length)
  })

  it('opens a floor: its rooms as tiles, floors above ghosted', () => {
    const housing = fixtureHousing()
    const model = buildHousingModel(housing, mass(5), { floor: 2, top: false, pickedUnitId: null })
    expect(model.openFloor).toBe(2)
    expect(model.ghost).not.toBeNull()
    const onFloor = housing.result.units.filter((u) => u.floor === 2).map((u) => u.id)
    expect(new Set(model.solidOwners.filter(Boolean))).toEqual(new Set(onFloor))
    expect(model.labels).toHaveLength(0) // labels only in Top view
  })

  it('Top view shows only the open floor, with room labels', () => {
    const housing = fixtureHousing()
    const model = buildHousingModel(housing, mass(5), { floor: 'all', top: true, pickedUnitId: null })
    expect(model.openFloor).toBe(0)
    expect(model.ghost).toBeNull()
    const rooms = housing.result.units.filter((u) => u.floor === 0).reduce((n, u) => n + u.plan.rooms.length, 0)
    expect(model.labels).toHaveLength(rooms)
  })

  it('marks locked units and drops floors above a lowered mass', () => {
    const housing = fixtureHousing()
    const plain = buildHousingModel(housing, mass(3), closed)
    expect(plain.markers).toBeNull()
    expect(new Set(plain.unitOwners.filter(Boolean)).size).toBe(housing.result.units.filter((u) => u.floor < 3).length)
    housing.result.units[0].locked = true
    expect(buildHousingModel(housing, mass(3), closed).markers).not.toBeNull()
  })
})
