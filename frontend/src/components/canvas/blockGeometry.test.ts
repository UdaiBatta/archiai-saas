import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { Room } from '../../store/canvasStore'
import { blockFill, blockHeight, buildBlockModel, clipSpan, clipToCut } from './blockGeometry'
import { buildMergedModel } from './mergedGeometry'
import { BLOCK_COLORS, PLAN_CUT_M } from './modelView'

const box = (patch: Partial<Room> & { id: string }): Room =>
  ({
    label: patch.id,
    objectType: 'room',
    roomType: 'bedroom',
    floorLevel: 0,
    position: { x: 0, y: 1.5, z: 0 },
    size: { w: 4, h: 3, d: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#888888',
    ...patch,
  }) as Room

const bedroom = box({ id: 'bed', roomType: 'bedroom' })
const kitchen = box({ id: 'kit', roomType: 'kitchen', position: { x: 6, y: 1.5, z: 0 } })
const wall = box({ id: 'w1', objectType: 'wall', roomType: 'wall', position: { x: 2, y: 1.5, z: 0 }, size: { w: 0.12, h: 3, d: 3 } })
const windowHigh = box({ id: 'win', objectType: 'window', roomType: 'window', hostWallId: 'w1', position: { x: 2, y: 1.6, z: 0 }, size: { w: 0.1, h: 1.2, d: 1 } })

/** World-space y extent of the triangles a model gives one owner. */
function yRange(model: ReturnType<typeof buildBlockModel>, owner: string, which: 'solid' | 'glass' = 'solid') {
  const geometry = model[which]!
  const owners = which === 'solid' ? model.solidOwners : model.glassOwners
  const position = geometry.getAttribute('position')
  let min = Infinity, max = -Infinity
  owners.forEach((id, t) => {
    if (id !== owner) return
    for (let v = 0; v < 3; v++) {
      const y = position.getY(t * 3 + v)
      min = Math.min(min, y); max = Math.max(max, y)
    }
  })
  return { min, max }
}

describe('clipping to the plan cut', () => {
  it('keeps the part of a span below the cut, or nothing', () => {
    expect(clipSpan(1.5, 3, 1.2)).toEqual({ centerY: 0.6, height: 1.2 })
    expect(clipSpan(0.4, 0.8, 1.2)).toEqual({ centerY: 0.4, height: 0.8 })
    expect(clipSpan(2.4, 1.2, 1.2)).toBeNull()
  })

  it('clips boxes in an object frame whose floor is its local bottom', () => {
    // A 3 m wall: one piece below a window (0..0.9 m) and the lintel above it (2.1..3 m).
    const pieces = clipToCut([
      { size: [1, 0.9, 0.1], position: [0, -1.05, 0] },
      { size: [1, 0.9, 0.1], position: [0, 1.05, 0] },
      { size: [1, 3, 0.1], position: [1, 0, 0] },
    ], 3)
    expect(pieces).toHaveLength(2)
    expect(pieces[1].size[1]).toBeCloseTo(PLAN_CUT_M)
    expect(pieces[1].position[1]).toBeCloseTo(-1.5 + PLAN_CUT_M / 2)
  })
})

describe('block colours', () => {
  it('colours a room by its zone, flags broken rooms and lifts the selection', () => {
    expect(blockFill(bedroom, false)).toBe(BLOCK_COLORS.zone.private)
    expect(blockFill(kitchen, false)).toBe(BLOCK_COLORS.zone.service)
    expect(blockFill(box({ id: 'u', roomType: 'room', label: 'Room' }), false)).toBe(BLOCK_COLORS.zone.unassigned)
    expect(blockFill(bedroom, true)).not.toBe(BLOCK_COLORS.zone.private)
    expect(blockFill(bedroom, false, true)).not.toBe(BLOCK_COLORS.zone.private)
  })
})

describe('buildBlockModel', () => {
  const objects = [bedroom, kitchen, wall, windowHigh]
  const floors = new Map([[0, 0]])
  const model = buildBlockModel(objects, [windowHigh], new Set(), { floorElevations: floors })

  it('draws every room as a volume standing on its floor, just under the cut', () => {
    for (const room of [bedroom, kitchen]) {
      const { min, max } = yRange(model, room.id)
      expect(min).toBeCloseTo(0)
      expect(max).toBeCloseTo(blockHeight())
    }
  })

  it('paints each block its zone colour', () => {
    const colour = model.solid!.getAttribute('color')
    const first = model.solidOwners.indexOf('kit') * 3
    const expected = new THREE.Color(BLOCK_COLORS.zone.service)
    expect(colour.getX(first)).toBeCloseTo(expected.r)
    expect(colour.getY(first)).toBeCloseTo(expected.g)
    expect(colour.getZ(first)).toBeCloseTo(expected.b)
  })

  it('cuts walls at plan height and clips windows to the cut', () => {
    expect(yRange(model, 'w1').max).toBeCloseTo(PLAN_CUT_M)
    const glass = yRange(model, 'win', 'glass')
    expect(glass.min).toBeCloseTo(1.0)
    expect(glass.max).toBeCloseTo(PLAN_CUT_M)
  })

  it('maps every triangle to a real object, so clicking a block selects its room', () => {
    const ids = new Set(objects.map((o) => o.id))
    const triangles = model.solid!.getAttribute('position').count / 3
    expect(model.solidOwners).toHaveLength(triangles)
    expect(model.solidOwners.every((id) => ids.has(id))).toBe(true)
  })

  it('follows a polygon room outline', () => {
    const l = box({ id: 'L', polygonVertices: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }] })
    const polygon = buildBlockModel([l], [], new Set())
    const position = polygon.solid!.getAttribute('position')
    let maxX = -Infinity
    for (let i = 0; i < position.count; i++) if (position.getY(i) > 0.5) maxX = Math.max(maxX, position.getX(i))
    expect(maxX).toBeCloseTo(2)
    expect(polygon.solidOwners.every((id) => id === 'L')).toBe(true)
  })

  it('costs no more draw calls than the white model', () => {
    const buffers = (m: { solid: unknown; glass: unknown; edges: unknown }) => [m.solid, m.glass, m.edges].filter(Boolean).length
    expect(buffers(model)).toBeLessThanOrEqual(buffers(buildMergedModel(objects, [windowHigh], new Set())))
  })
})
