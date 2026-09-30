import { describe, expect, it } from 'vitest'
import type { Room } from '../../store/canvasStore'
import { buildMergedModel, isMergeable } from './mergedGeometry'
import { MODEL_COLORS } from './modelView'

const base = { rotation: { x: 0, y: 0, z: 0 }, color: '#cccccc', floorLevel: 0 }
const wall: Room = { ...base, id: 'w1', label: 'Wall', objectType: 'wall', position: { x: 2, y: 1.5, z: 0 }, size: { w: 4, h: 3, d: 0.2 } } as Room
const door: Room = { ...base, id: 'd1', label: 'Door', objectType: 'door', hostWallId: 'w1', position: { x: 2, y: 1.05, z: 0 }, size: { w: 0.9, h: 2.1, d: 0.2 } } as Room
const room: Room = { ...base, id: 'r1', label: 'Bedroom', objectType: 'room', roomType: 'bedroom', position: { x: 2, y: 1.5, z: 2 }, size: { w: 4, h: 3, d: 4 } } as Room
const win: Room = { ...base, id: 'g1', label: 'Window', objectType: 'window', position: { x: 0, y: 1.5, z: 2 }, size: { w: 0.2, h: 1.2, d: 1.2 } } as Room

const bed: Room = { ...base, id: 'f1', label: 'Double bed', objectType: 'furniture', roomType: 'double_bed', position: { x: 2, y: 0.425, z: 2 }, size: { w: 1.6, h: 0.85, d: 2 } } as Room

describe('buildMergedModel', () => {
  it('draws furniture as its proxy parts, standing on the floor', () => {
    const model = buildMergedModel([bed], [], new Set())
    // Frame, mattress, headboard, two pillows: 5 boxes of 12 triangles.
    expect(model.solidOwners).toEqual(Array(60).fill('f1'))
    const position = model.solid!.getAttribute('position')
    const ys = Array.from({ length: position.count }, (_, i) => position.getY(i))
    expect(Math.min(...ys)).toBeCloseTo(0)
    expect(Math.max(...ys)).toBeCloseTo(0.85)
  })

  it('draws walls (cut at openings), floors and windows into three buffers with per-triangle owners', () => {
    const model = buildMergedModel([wall, room, win], [door, win], new Set())
    // A door in the middle of a wall leaves left, right and head pieces: 3 boxes x 12 triangles,
    // plus the floor slab box (12).
    expect(model.solidOwners.filter((id) => id === 'w1')).toHaveLength(36)
    expect(model.solidOwners.filter((id) => id === 'r1')).toHaveLength(12)
    expect(model.glassOwners).toEqual(Array(12).fill('g1'))
    expect(model.solid!.getAttribute('position').count).toBe(model.solidOwners.length * 3)
    expect(model.edges!.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('tints a floor that breaks a hard rule', () => {
    const clean = buildMergedModel([room], [], new Set())
    const flagged = buildMergedModel([room], [], new Set(['r1']))
    const r = (m: typeof clean) => m.solid!.getAttribute('color').getX(0)
    expect(r(flagged)).not.toBeCloseTo(r(clean))
  })

  it('sits floor slabs on the floor, not at the room box centre', () => {
    const model = buildMergedModel([room], [], new Set())
    const ys = Array.from({ length: model.solid!.getAttribute('position').count }, (_, i) => model.solid!.getAttribute('position').getY(i))
    expect(Math.min(...ys)).toBeCloseTo(0)
    expect(Math.max(...ys)).toBeCloseTo(0.045)
  })

  it('merges only walls, windows, spaces and furniture', () => {
    expect([wall, win, room, door, bed].map(isMergeable)).toEqual([true, true, true, false, true])
    expect(MODEL_COLORS.wall).toBeTruthy()
  })
})
