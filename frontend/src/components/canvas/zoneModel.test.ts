import { describe, expect, it } from 'vitest'

import type { Room } from '../../store/canvasStore'
import { summarizeZones, zoneForRoom } from './zoneModel'

function room(partial: Partial<Room>): Room {
  return {
    id: partial.id ?? 'r1',
    label: partial.label ?? 'Room',
    objectType: partial.objectType ?? 'room',
    roomType: partial.roomType,
    position: partial.position ?? { x: 0, y: 1.5, z: 0 },
    size: partial.size ?? { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#5F6E88',
  } as Room
}

describe('zoneForRoom', () => {
  it('maps residential room types to the expected zones', () => {
    expect(zoneForRoom(room({ roomType: 'living_room' }))).toBe('public')
    expect(zoneForRoom(room({ roomType: 'bedroom' }))).toBe('private')
    expect(zoneForRoom(room({ roomType: 'kitchen' }))).toBe('service')
    expect(zoneForRoom(room({ roomType: 'hallway' }))).toBe('circulation')
    // Every type the layout engine emits (backend RoomType) has a zone.
    expect(zoneForRoom(room({ roomType: 'dining' }))).toBe('public')
    expect(zoneForRoom(room({ roomType: 'parking' }))).toBe('service')
    expect(zoneForRoom(room({ roomType: 'storage' }))).toBe('utility')
    expect(zoneForRoom(room({ roomType: 'office' }))).toBe('collaborative')
  })

  it('maps circulation object types regardless of room type', () => {
    expect(zoneForRoom(room({ objectType: 'corridor' }))).toBe('circulation')
    expect(zoneForRoom(room({ objectType: 'stair' }))).toBe('circulation')
    expect(zoneForRoom(room({ objectType: 'lift' }))).toBe('circulation')
    expect(zoneForRoom(room({ objectType: 'shaft' }))).toBe('utility')
  })

  it('falls back to the label when the room type is unknown', () => {
    expect(zoneForRoom(room({ roomType: 'mystery', label: 'Master Bedroom' }))).toBe('private')
  })
})

describe('summarizeZones', () => {
  it('computes per-zone area, count, and percentage', () => {
    const rooms = [
      room({ id: 'a', roomType: 'living_room', size: { w: 6, h: 3, d: 5 } }), // 30 public
      room({ id: 'b', roomType: 'bedroom', size: { w: 5, h: 3, d: 4 } }), // 20 private
      room({ id: 'c', roomType: 'bedroom', size: { w: 5, h: 3, d: 2 } }), // 10 private
      room({ id: 'd', objectType: 'wall', size: { w: 6, h: 2.8, d: 0.25 } }), // excluded
    ]
    const summary = summarizeZones(rooms)

    const publicRow = summary.find((row) => row.zone === 'public')!
    const privateRow = summary.find((row) => row.zone === 'private')!
    expect(publicRow.count).toBe(1)
    expect(publicRow.areaSqm).toBeCloseTo(30)
    expect(publicRow.percent).toBeCloseTo(50)
    expect(privateRow.count).toBe(2)
    expect(privateRow.areaSqm).toBeCloseTo(30)
    expect(privateRow.percent).toBeCloseTo(50)
  })

  it('returns an empty summary when there are no zonable objects', () => {
    expect(summarizeZones([room({ objectType: 'wall' })])).toEqual([])
  })
})
