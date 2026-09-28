import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_FLOOR, INITIAL_ROOMS, useCanvasStore } from '../../store/canvasStore'
import { EditorDock } from './EditorDock'

const Dock = (props: { readOnly?: boolean; modelStage?: boolean }) => <EditorDock preset="perspective" onPreset={() => {}} {...props} />

beforeEach(() => {
  useCanvasStore.setState({
    rooms: INITIAL_ROOMS.map((room) => ({
      ...room,
      position: { ...room.position },
      size: { ...room.size },
      rotation: { ...room.rotation },
    })),
    floors: [DEFAULT_FLOOR],
    selectedFloor: 0,
    viewMode: '3d',
    selectedId: 'room-1',
    placementMode: null,
    measureMode: false,
    showDimensions: false,
    layoutMetadata: {
      pipeline: 'mvp',
      mvpQuality: { valid: true, score: 90, hard_violations: [], warnings: [] },
    },
    activityLog: [],
    past: [],
    future: [],
  })
})

describe('Dock edit tools: history', () => {
  it('undoes and redoes a room rotation with matching validation state', () => {
    const originalQuality = useCanvasStore.getState().layoutMetadata.mvpQuality
    render(<Dock />)

    act(() => {
      useCanvasStore.getState().updateRoom('room-1', {
        rotation: { x: 0, y: 90, z: 0 },
      })
      useCanvasStore.setState((state) => ({
        layoutMetadata: {
          ...state.layoutMetadata,
          mvpQuality: {
            valid: false,
            score: 40,
            hard_violations: [
              { code: 'overlap', room_ids: ['room-1'], message: 'Room overlaps' },
            ],
            warnings: [],
          },
        },
      }))
    })

    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toBeEnabled()
    fireEvent.click(undo)

    let state = useCanvasStore.getState()
    expect(state.rooms.find((room) => room.id === 'room-1')?.rotation.y).toBe(0)
    expect(state.layoutMetadata.mvpQuality).toEqual(originalQuality)
    expect(undo).toBeDisabled()

    const redo = screen.getByRole('button', { name: 'Redo' })
    expect(redo).toBeEnabled()
    fireEvent.click(redo)

    state = useCanvasStore.getState()
    expect(state.rooms.find((room) => room.id === 'room-1')?.rotation.y).toBe(90)
    expect(state.layoutMetadata.mvpQuality).toMatchObject({ valid: false, score: 40 })
  })
})

describe('Dock edit tools', () => {
  it('leads with the Edit group: Select, Room, Measure, More', () => {
    render(<Dock />)
    const dock = screen.getByRole('navigation', { name: 'Editor dock' })
    const groups = within(dock).getAllByRole('group').map((group) => group.getAttribute('aria-label'))
    expect(groups).toEqual(['Edit', 'History', 'View', 'Lenses'])
    const edit = within(dock).getByRole('group', { name: 'Edit' })
    expect(within(edit).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Select', 'Room', 'Measure', 'More'])
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Measure' })).toHaveAttribute('title', 'Measure (Alt)')
  })

  it('arms Room placement and toggles Measure with pressed states', async () => {
    const user = userEvent.setup()
    render(<Dock />)
    await user.click(screen.getByRole('button', { name: 'Room' }))
    expect(useCanvasStore.getState().placementMode).toBe('room')
    expect(screen.getByRole('button', { name: 'Room' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Measure' }))
    expect(useCanvasStore.getState().placementMode).toBeNull()
    expect(useCanvasStore.getState().measureMode).toBe(true)
    expect(screen.getByRole('button', { name: 'Measure' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(useCanvasStore.getState().measureMode).toBe(false)
  })

  it('opens the add-object menu from More, arms a placement and closes it', async () => {
    const user = userEvent.setup()
    useCanvasStore.setState({ viewMode: 'zoning' })
    render(<Dock />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    const menu = screen.getByRole('dialog', { name: 'Add object' })
    const first = within(menu).getAllByRole('button')[0]
    expect(first).toHaveFocus()
    expect(within(menu).queryByRole('button', { name: 'Room' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('button', { name: 'Door' }))
    expect(useCanvasStore.getState().placementMode).toBe('door')
    // Placement needs an editable canvas, so a lens jumps back to the plan.
    expect(useCanvasStore.getState().viewMode).toBe('floor_plan')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers Furniture instead of Room on the model stage, without lenses', () => {
    render(<Dock modelStage />)
    expect(screen.getByRole('button', { name: 'Furniture' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Room' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Lenses' })).not.toBeInTheDocument()
  })

  it('has no edit or history tools when read-only', () => {
    render(<Dock readOnly />)
    for (const name of ['Select', 'Room', 'Measure', 'More', 'Undo', 'Redo']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})
