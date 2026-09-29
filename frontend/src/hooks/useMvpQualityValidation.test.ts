import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMvpQualityValidation } from './useMvpQualityValidation'
import { validateAndSyncMvpLayout } from '../services/mvp.service'
import { layoutPlanToCanvas } from '../services/mvpLayoutAdapter'
import { useCanvasStore } from '../store/canvasStore'
import type {
  LayoutPlan,
  MvpQualitySnapshot,
  RequirementsSpec,
} from '../types/contracts'

vi.mock('../services/mvp.service', () => ({
  validateAndSyncMvpLayout: vi.fn(),
}))

const requirements: RequirementsSpec = {
  building_type: 'house',
  floors: 1,
  rooms: [{ type: 'bedroom', count: 1 }],
  adjacency: [],
  avoid_adjacency: [],
  plot: { width_m: 9, depth_m: 12 },
  facing: 'east',
  missing_info: [],
}

const layout: LayoutPlan = {
  plot: { width_m: 9, depth_m: 12, facing: 'east' },
  rooms: [
    {
      id: 'room-1',
      type: 'bedroom',
      label: 'Bedroom',
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      rotation: 0,
    },
  ],
  walls: [],
  doors: [],
}

const initialQuality: MvpQualitySnapshot = {
  valid: true,
  score: 80,
  hard_violations: [],
  warnings: [],
}

const refreshedQuality: MvpQualitySnapshot = {
  valid: false,
  score: 49,
  hard_violations: [
    { code: 'out_of_bounds', room_ids: ['room-1'], message: 'Bedroom leaves the plot' },
  ],
  warnings: [],
}

const refreshedLayout: LayoutPlan = {
  ...layout,
  rooms: [{ ...layout.rooms[0], x: 5 }],
  walls: [
    {
      id: 'wall-synced',
      x1: 9,
      y1: 0,
      x2: 9,
      y2: 4,
      thickness: 0.115,
    },
  ],
  doors: [
    {
      id: 'door-synced',
      wall_ref: 'wall-synced',
      offset: 1,
      width: 0.9,
    },
  ],
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(validateAndSyncMvpLayout).mockReset()
  vi.mocked(validateAndSyncMvpLayout).mockResolvedValue({
    layout: refreshedLayout,
    quality: refreshedQuality,
  })
  useCanvasStore.getState().loadLayout(
    layoutPlanToCanvas(layout, {
      prompt: 'vastu bedroom house',
      requirements,
      quality: initialQuality,
    }),
  )
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('useMvpQualityValidation', () => {
  it('does not revalidate the unchanged generated plan', async () => {
    renderHook(() => useMvpQualityValidation({ debounceMs: 100 }))

    await advance(100)

    expect(validateAndSyncMvpLayout).not.toHaveBeenCalled()
  })

  it('re-derives connections at once for a plan saved without them', async () => {
    // Older saves carry no edge data; waiting for an edit left the access
    // graph reporting every room as unreachable.
    useCanvasStore.setState((state) => {
      const { mvpEdges: _dropped, ...metadata } = state.layoutMetadata
      return { layoutMetadata: metadata }
    })
    renderHook(() => useMvpQualityValidation({ debounceMs: 100 }))

    await advance(100)

    expect(validateAndSyncMvpLayout).toHaveBeenCalledTimes(1)
    expect(Array.isArray(useCanvasStore.getState().layoutMetadata.mvpEdges)).toBe(true)
    await advance(100)
    expect(validateAndSyncMvpLayout).toHaveBeenCalledTimes(1)
  })

  it('still re-derives when an unrelated update lands during the debounce', async () => {
    // The backend's generate path saves plans without edge data; a re-render
    // mid-debounce (floors, save status) used to cancel the only request.
    useCanvasStore.setState((state) => {
      const { mvpEdges: _dropped, ...metadata } = state.layoutMetadata
      return { layoutMetadata: metadata }
    })
    renderHook(() => useMvpQualityValidation({ debounceMs: 100 }))

    await advance(50)
    act(() => {
      useCanvasStore.setState((state) => ({ floors: state.floors.map((floor) => ({ ...floor })) }))
    })
    await advance(100)

    expect(validateAndSyncMvpLayout).toHaveBeenCalledTimes(1)
  })

  it('debounces room edits and publishes the latest full quality report', async () => {
    renderHook(() => useMvpQualityValidation({ debounceMs: 100 }))

    act(() => {
      useCanvasStore.getState().updateRoom('room-1', {
        position: { x: 8, y: 1.5, z: 2 },
      })
    })

    await advance(99)
    expect(validateAndSyncMvpLayout).not.toHaveBeenCalled()

    await advance(1)
    expect(validateAndSyncMvpLayout).toHaveBeenCalledWith(
      expect.objectContaining({
        rooms: [expect.objectContaining({ id: 'room-1', x: 6, y: 0 })],
      }),
      { requirements, includeVastu: true },
    )
    const synced = useCanvasStore.getState()
    expect(synced.layoutMetadata.mvpQuality).toEqual(refreshedQuality)
    expect(synced.rooms.find((object) => object.id === 'wall-synced')).toBeDefined()
    expect(synced.rooms.find((object) => object.id === 'door-synced')).toMatchObject({
      hostWallId: 'wall-synced',
    })
    // Rooms may overhang the plot now (balconies); the move is kept as made.
    expect(synced.rooms.find((object) => object.id === 'room-1')?.position.x).toBe(8)
    expect(synced.past).toHaveLength(1)
    expect(synced.activityLog).toHaveLength(1)
    expect(synced.saveStatus).toBe('unsaved')

    await advance(100)
    expect(validateAndSyncMvpLayout).toHaveBeenCalledTimes(1)
  })

  it('stays inactive for legacy canvas layouts', async () => {
    useCanvasStore.setState({ layoutMetadata: { pipeline: 'legacy' } })
    renderHook(() => useMvpQualityValidation({ debounceMs: 100 }))

    act(() => {
      useCanvasStore.getState().updateRoom('room-1', {
        position: { x: 3, y: 1.5, z: 2 },
      })
    })
    await advance(100)

    expect(validateAndSyncMvpLayout).not.toHaveBeenCalled()
  })
})
