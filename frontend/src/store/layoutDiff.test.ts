import { describe, expect, it } from 'vitest'

import type { Room } from './canvasStore'
import { diffLayouts, isSameLayout } from './layoutDiff'

function room(id: string, patch: Partial<Room> = {}): Room {
  return {
    id,
    label: id,
    roomType: 'bedroom',
    objectType: 'room',
    position: { x: 0, y: 1.5, z: 0 },
    size: { w: 4, h: 3, d: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#888',
    ...patch,
  } as Room
}

describe('diffLayouts', () => {
  it('says nothing differs for identical copies', () => {
    const rooms = [room('a'), room('b')]
    expect(isSameLayout(diffLayouts(rooms, structuredClone(rooms)))).toBe(true)
  })

  it('lists rooms only in one copy, by name', () => {
    const diff = diffLayouts([room('a'), room('mine', { label: 'Study' })], [room('a'), room('theirs', { label: 'Garage' })])
    expect(diff.onlyHere).toEqual(['Study'])
    expect(diff.onlyThere).toEqual(['Garage'])
  })

  it('says what changed in a room both copies have', () => {
    const diff = diffLayouts(
      [room('a', { label: 'Kitchen', size: { w: 4, h: 3, d: 3 }, position: { x: 5, y: 1.5, z: 0 } })],
      [room('a', { label: 'Galley', size: { w: 3, h: 3, d: 3 }, roomType: 'kitchen' })],
    )
    expect(diff.changed).toEqual([{ label: 'Kitchen', what: ['named "Galley" there', 'different use', 'resized', 'moved'] }])
  })

  it('ignores differences below 5 cm and walls the engine derives', () => {
    const wall = (x: number) => room('w1', { objectType: 'wall', derived: 'engine', position: { x, y: 1, z: 0 } })
    const diff = diffLayouts(
      [room('a', { position: { x: 1, y: 1.5, z: 1 } }), wall(0)],
      [room('a', { position: { x: 1.04, y: 1.5, z: 1.02 } }), wall(7)],
    )
    expect(isSameLayout(diff)).toBe(true)
  })
})
