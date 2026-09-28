import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_FLOOR, INITIAL_ROOMS, useCanvasStore } from '../../store/canvasStore'
import { ToolRail } from './ToolRail'

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

describe('ToolRail history controls', () => {
  it('undoes and redoes a room rotation with matching validation state', () => {
    const originalQuality = useCanvasStore.getState().layoutMetadata.mvpQuality
    render(<ToolRail />)

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
