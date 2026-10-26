import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { Room } from '../../store/canvasStore'
import { BLOCK_FLOOR_M, blockFill, buildBlockModel } from './blockGeometry'
import { buildMergedModel } from './mergedGeometry'

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

describe('block colours', () => {
  it('colours a room by its type, flags broken rooms and lifts the selection', () => {
    const base = blockFill(bedroom, false)
    expect(blockFill(box({ id: 'bed2', label: 'Guest bedroom' }), false)).toBe(base)
    expect(blockFill(kitchen, false)).not.toBe(base)
    expect(blockFill(bedroom, true)).not.toBe(base)
    expect(blockFill(bedroom, false, true)).not.toBe(base)
  })
})

describe('buildBlockModel', () => {
  const objects = [bedroom, kitchen, wall, windowHigh]
  const model = buildBlockModel(objects, [windowHigh], new Set())

  it('draws every room as a see-through volume of its full height on a solid coloured floor', () => {
    for (const room of [bedroom, kitchen]) {
      const volume = yRange(model, room.id, 'glass')
      expect(volume.min).toBeCloseTo(0)
      expect(volume.max).toBeCloseTo(room.size.h)
      const floor = yRange(model, room.id)
      expect(floor.min).toBeCloseTo(0)
      expect(floor.max).toBeCloseTo(BLOCK_FLOOR_M)
    }
  })

  it('paints each block its room colour', () => {
    const colour = model.glass!.getAttribute('color')
    const first = model.glassOwners.indexOf('kit') * 3
    const expected = new THREE.Color(blockFill(kitchen, false))
    expect(colour.getX(first)).toBeCloseTo(expected.r)
    expect(colour.getY(first)).toBeCloseTo(expected.g)
    expect(colour.getZ(first)).toBeCloseTo(expected.b)
  })

  it('draws walls as outlines only and windows as glass, whole', () => {
    expect(model.solidOwners).not.toContain('w1')
    expect(model.glassOwners).not.toContain('w1')
    const wallOnly = buildBlockModel([wall], [], new Set())
    expect(wallOnly.solid ?? wallOnly.glass).toBeFalsy()
    const edges = wallOnly.edges!.getAttribute('position')
    let top = 0
    for (let i = 0; i < edges.count; i++) top = Math.max(top, edges.getY(i))
    expect(top).toBeCloseTo(wall.size.h)
    const glass = yRange(model, 'win', 'glass')
    expect(glass.min).toBeCloseTo(1.0)
    expect(glass.max).toBeCloseTo(2.2)
  })

  it('maps every triangle to a real object, so clicking a block selects its room', () => {
    const ids = new Set(objects.map((o) => o.id))
    for (const [geometry, owners] of [[model.solid!, model.solidOwners], [model.glass!, model.glassOwners]] as const) {
      expect(owners).toHaveLength(geometry.getAttribute('position').count / 3)
      expect(owners.every((id) => ids.has(id))).toBe(true)
    }
  })

  it('follows a polygon room outline', () => {
    const l = box({ id: 'L', polygonVertices: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }] })
    const polygon = buildBlockModel([l], [], new Set())
    const position = polygon.glass!.getAttribute('position')
    let maxX = -Infinity
    for (let i = 0; i < position.count; i++) if (position.getY(i) > 0.5) maxX = Math.max(maxX, position.getX(i))
    expect(maxX).toBeCloseTo(2)
    expect(polygon.glassOwners.every((id) => id === 'L')).toBe(true)
  })

  it('costs no more draw calls than the white model', () => {
    const buffers = (m: { solid: unknown; glass: unknown; edges: unknown }) => [m.solid, m.glass, m.edges].filter(Boolean).length
    expect(buffers(model)).toBeLessThanOrEqual(buffers(buildMergedModel(objects, [windowHigh], new Set())))
  })
})
