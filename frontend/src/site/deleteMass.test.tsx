import { fireEvent, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore } from '../store/canvasStore'
import { useCanvasKeyboardShortcuts } from '../components/canvas/useCanvasKeyboardShortcuts'
import { useMassUi } from './massStore'
import type { Mass } from './siteTypes'

const mass = (id: string): Mass => ({ id, name: id, footprint: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }], floors: 3, floorHeightM: 3.2, baseM: 0 })

beforeEach(() => {
  useCanvasStore.setState({
    rooms: [], selectedId: null, past: [], future: [], activityLog: [],
    layoutMetadata: { masses: [mass('m1'), mass('m2')], housing: { m1: { units: [] } } },
  })
  useMassUi.getState().select('m1')
})

describe('deleting a mass', () => {
  it('removes the mass and its housing as one undo step', () => {
    useCanvasStore.getState().deleteMass('m1')
    const meta = useCanvasStore.getState().layoutMetadata
    expect((meta.masses as Mass[]).map((m) => m.id)).toEqual(['m2'])
    expect(meta.housing).toEqual({})
    useCanvasStore.getState().undo()
    expect((useCanvasStore.getState().layoutMetadata.masses as Mass[]).map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('the Delete key deletes the selected mass when no room is selected', () => {
    renderHook(() => useCanvasKeyboardShortcuts())
    fireEvent.keyDown(window, { key: 'Delete' })
    expect((useCanvasStore.getState().layoutMetadata.masses as Mass[]).map((m) => m.id)).toEqual(['m2'])
    expect(useMassUi.getState().selectedMassId).toBeNull()
  })
})
