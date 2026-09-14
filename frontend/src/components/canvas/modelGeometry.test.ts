import { describe, expect, it } from 'vitest'
import type { Room } from '../../store/canvasStore'
import { wallModelPieces } from './modelGeometry'

const wall: Room = { id: 'wall', label: 'Wall', objectType: 'wall', floorLevel: 0, position: { x: 5, y: 1.5, z: 0 }, size: { w: 10, h: 3, d: 0.2 }, rotation: { x: 0, y: 0, z: 0 }, color: '#fff' }
const door: Room = { ...wall, id: 'door', objectType: 'door', hostWallId: 'wall', position: { x: 5, y: 1.05, z: 0 }, size: { w: 1, h: 2.1, d: 0.2 } }
const volume = (pieces: ReturnType<typeof wallModelPieces>) => pieces.reduce((sum, piece) => sum + piece.size[0] * piece.size[1] * piece.size[2], 0)

describe('model wall openings', () => {
  it('cuts a hosted door while preserving its lintel and source records', () => {
    const before = JSON.stringify([wall, door])
    const pieces = wallModelPieces(wall, [door])
    expect(pieces).toHaveLength(3)
    expect(volume(pieces)).toBeCloseTo(6 - 1 * 2.1 * 0.2)
    expect(pieces.find((piece) => piece.position[0] === 0)?.position[1]).toBeCloseTo(1.05)
    expect(JSON.stringify([wall, door])).toBe(before)
  })
  it('does not invent openings for unhosted doors or another level', () => {
    expect(wallModelPieces(wall, [{ ...door, hostWallId: undefined }, { ...door, floorLevel: 1 }])).toHaveLength(1)
  })
  it('supports vertical walls and overlapping openings without negative pieces', () => {
    const vertical = { ...wall, size: { w: 0.2, h: 3, d: 10 } }
    const opening = { ...door, size: { w: 0.2, h: 2.1, d: 1 } }
    const pieces = wallModelPieces(vertical, [opening, opening])
    expect(volume(pieces)).toBeCloseTo(6 - 0.42)
    expect(pieces.every((piece) => piece.size.every((size) => size > 0))).toBe(true)
  })
})
