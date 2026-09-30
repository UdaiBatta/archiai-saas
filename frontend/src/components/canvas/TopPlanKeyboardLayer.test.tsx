import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCanvasStore, type Room } from '../../store/canvasStore'
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts'
import { TopPlanKeyboardLayer } from './TopPlanKeyboardLayer'

const room = (id: string, label: string, x: number, overrides: Partial<Room> = {}): Room => ({
  id,
  label,
  roomType: 'living_room',
  objectType: 'room',
  floorId: 'floor_0',
  floorLevel: 0,
  position: { x, y: 1.5, z: 4 },
  size: { w: 4, h: 3, d: 4 },
  rotation: { x: 0, y: 0, z: 0 },
  color: '#b3b8e9',
  ...overrides,
})

const ROOMS = [room('room-1', 'Living Room', 2), room('room-2', 'Bedroom', 6)]

function Harness({ onFocusRoom = () => {} }: { onFocusRoom?: (id: string | null) => void }) {
  useCanvasKeyboardShortcuts()
  return <TopPlanKeyboardLayer rooms={ROOMS} invalidRoomIds={new Set(['room-2'])} onFocusRoom={onFocusRoom} />
}

beforeEach(() => {
  useCanvasStore.getState().loadLayout({
    version: '1.0',
    floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, rooms: ROOMS }],
    rooms: ROOMS,
  })
  useCanvasStore.setState({ selectedId: null })
})

describe('TopPlanKeyboardLayer', () => {
  it('exposes one focusable button per object, named with label and area', () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: /^Living Room, .*, 16\.0 m²$/ })).toBeInTheDocument()
    expect(screen.getByTestId('plan-object-room-2')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('plan-object-room-1')).not.toHaveAttribute('aria-invalid')
  })

  it('Tab walks the rooms, Enter and Space select, Escape clears', async () => {
    const onFocusRoom = vi.fn()
    render(<Harness onFocusRoom={onFocusRoom} />)
    const user = userEvent.setup()

    await user.tab()
    expect(onFocusRoom).toHaveBeenLastCalledWith('room-1')
    await user.keyboard('{Enter}')
    expect(useCanvasStore.getState().selectedId).toBe('room-1')
    expect(screen.getByTestId('plan-object-room-1')).toHaveAttribute('aria-pressed', 'true')

    await user.tab()
    expect(onFocusRoom).toHaveBeenLastCalledWith('room-2')
    await user.keyboard(' ')
    expect(useCanvasStore.getState().selectedId).toBe('room-2')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useCanvasStore.getState().selectedId).toBeNull()
  })
})
