import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from '../../store/canvasStore'
import { followSelection } from '../../hooks/useMvpQualityValidation'
import { DoorPosition } from './DoorPosition'

const base = { floorLevel: 0, rotation: { x: 0, y: 0, z: 0 }, color: '#000' }
const room = (id: string, x: number): Room => ({
  ...base, id, label: id, roomType: 'bedroom', objectType: 'room', position: { x, y: 1.5, z: 2 }, size: { w: 4, h: 3, d: 4 },
})
// Vertical wall at x=4 running z 0..4 between rooms a and b.
const WALL: Room = {
  ...base, id: 'w1', label: 'Wall', roomType: 'wall', objectType: 'wall',
  position: { x: 4, y: 1.5, z: 2 }, size: { w: 0.115, h: 3, d: 4 }, betweenRooms: ['a', 'b'],
}
const DOOR: Room = {
  ...base, id: 'd1', label: 'Door', roomType: 'door', objectType: 'door', hostWallId: 'w1',
  position: { x: 4, y: 1.05, z: 2 }, size: { w: 0.16, h: 2.1, d: 0.9 },
}

function Harness() {
  const door = useCanvasStore((s) => s.rooms.find((r) => r.id === 'd1'))
  return door ? <DoorPosition door={door} /> : null
}

beforeEach(() => {
  useCanvasStore.setState({
    rooms: [room('a', 2), room('b', 6), WALL, DOOR],
    floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, footprint: { x: 0, z: 0, w: 8, d: 4 }, rooms: [] }],
    layoutMetadata: {}, activityLog: [], past: [], future: [],
  })
})

describe('DoorPosition', () => {
  it('slides the door along its wall and records the spot as the door connection', () => {
    render(<Harness />)
    const slider = screen.getByLabelText('Door position along wall')
    expect(slider).toHaveValue('0.5')
    fireEvent.pointerDown(slider)
    fireEvent.change(slider, { target: { value: '0.25' } })
    fireEvent.pointerUp(slider, { currentTarget: slider })
    const door = useCanvasStore.getState().rooms.find((r) => r.id === 'd1')!
    expect(door.position).toMatchObject({ x: 4, z: 1 })
    expect(useCanvasStore.getState().layoutMetadata.mvpConnections).toEqual([
      { room_a: 'a', room_b: 'b', kind: 'door', at: 0.25, width: 0.9 },
    ])
    // One undoable step for the whole slide.
    expect(useCanvasStore.getState().activityLog).toHaveLength(1)
  })
})

describe('followSelection', () => {
  it('follows a rebuilt door to the one between the same rooms', () => {
    const after = [room('a', 2), room('b', 6), { ...WALL, id: 'w9' }, { ...DOOR, id: 'd7', hostWallId: 'w9' }]
    expect(followSelection([room('a', 2), room('b', 6), WALL, DOOR], after, 'd1')).toBe('d7')
    expect(followSelection([WALL], [WALL], 'w1')).toBe('w1')
    expect(followSelection([room('a', 2)], [], 'a')).toBeNull()
  })
})
