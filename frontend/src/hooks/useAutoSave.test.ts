import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useAutoSave } from './useAutoSave'
import { saveDesignDraft } from '../services/design.service'
import {
  DEFAULT_FLOOR,
  DEFAULT_FLOOR_HEIGHT,
  INITIAL_ROOMS,
  useCanvasStore,
} from '../store/canvasStore'

vi.mock('../services/design.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/design.service')>()),
  saveDesignDraft: vi.fn(),
}))

const draftResponse = {
  id: 'draft-version-1',
  designId: 'design-1',
  designVersionId: 'draft-version-1',
  projectId: 'project-1',
  version: '1.0',
  versionNumber: 1,
  versionType: 'auto_draft',
  changeSummary: 'Auto-saved draft',
  createdAt: '2026-05-30T10:00:00.000Z',
  metadata: { prompt: 'draft', building_type: 'apartment', room_count: 1 },
  building: { floorHeight: DEFAULT_FLOOR_HEIGHT },
  floors: [],
  rooms: [],
}

function resetCanvasStore() {
  useCanvasStore.setState({
    rooms: INITIAL_ROOMS.map((room) => ({
      ...room,
      floorId: DEFAULT_FLOOR.id,
      floorLevel: DEFAULT_FLOOR.level,
      position: { ...room.position },
      size: { ...room.size },
      rotation: { ...room.rotation },
    })),
    floors: [DEFAULT_FLOOR],
    selectedFloor: 0,
    floorHeight: DEFAULT_FLOOR_HEIGHT,
    designId: 'design-1',
    designVersionId: 'version-1',
    layoutMetadata: { prompt: 'draft', building_type: 'apartment', room_count: 1 },
    selectedId: null,
    snapToGrid: false,
    gridSize: 1,
    saveStatus: 'saved',
    lastSavedAt: null,
    hasUnsavedChanges: false,
    lastDraftSavedAt: null,
    draftStatus: 'idle',
    draftError: null,
    designRevision: null,
    saveConflict: null,
    recoveredDraftAvailable: false,
    latestDraftVersionId: null,
    activityLog: [],
  })
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(saveDesignDraft).mockReset()
  vi.mocked(saveDesignDraft).mockResolvedValue(draftResponse)
  resetCanvasStore()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('useAutoSave', () => {
  it('does not save when disabled', async () => {
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', enabled: false, debounceMs: 100 }))

    await advance(100)

    expect(saveDesignDraft).not.toHaveBeenCalled()
  })

  it('does not save without a designId', async () => {
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: null, debounceMs: 100 }))

    await advance(100)

    expect(saveDesignDraft).not.toHaveBeenCalled()
  })

  it('does not save when there are no unsaved changes', async () => {
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    expect(saveDesignDraft).not.toHaveBeenCalled()
  })

  it('debounces before saving a draft', async () => {
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(99)
    expect(saveDesignDraft).not.toHaveBeenCalled()

    await advance(1)
    expect(saveDesignDraft).toHaveBeenCalledTimes(1)
  })

  it('calls the draft service with designId and serialized layout', async () => {
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)
    expect(saveDesignDraft).toHaveBeenCalledTimes(1)

    expect(saveDesignDraft).toHaveBeenCalledWith(
      'design-1',
      expect.objectContaining({
        version: '1.0',
        designId: 'design-1',
        rooms: expect.any(Array),
      }),
      { baseRevision: null },
    )
  })

  it('saves on top of the revision it loaded, and moves on to the one the server returns', async () => {
    useCanvasStore.setState({ designRevision: 4 })
    vi.mocked(saveDesignDraft).mockResolvedValue({ ...draftResponse, revision: 5 })
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    expect(vi.mocked(saveDesignDraft).mock.calls[0][2]).toEqual({ baseRevision: 4 })
    expect(useCanvasStore.getState().designRevision).toBe(5)
  })

  it('keeps the edits and stops saving when the server says the design changed elsewhere', async () => {
    useCanvasStore.setState({ designRevision: 4 })
    vi.mocked(saveDesignDraft).mockRejectedValue({
      response: { status: 409, data: { code: 'REVISION_CONFLICT', error: 'Changed elsewhere', currentRevision: 7 } },
    })
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    const state = useCanvasStore.getState()
    expect(state.saveConflict).toEqual({ currentRevision: 7, message: 'Changed elsewhere' })
    expect(state.hasUnsavedChanges).toBe(true)
    expect(state.rooms.length).toBeGreaterThan(0)
    expect(state.designRevision).toBe(4)

    // Further edits do not retry the refused save every few seconds.
    act(() => {
      useCanvasStore.getState().updateRoom('room-1', { position: { x: 9, y: 1.5, z: 0 } })
    })
    await advance(1000)
    expect(saveDesignDraft).toHaveBeenCalledTimes(1)
  })

  it('a plain network failure is an error, not a conflict', async () => {
    vi.mocked(saveDesignDraft).mockRejectedValue({ response: { status: 500, data: { error: 'boom' } } })
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    expect(useCanvasStore.getState().saveConflict).toBeNull()
    expect(useCanvasStore.getState().draftStatus).toBe('error')
  })

  it('marks draft as saving while the save request is pending', async () => {
    let resolveDraft: (value: typeof draftResponse) => void
    const pendingDraft = new Promise<typeof draftResponse>((resolve) => {
      resolveDraft = resolve
    })
    vi.mocked(saveDesignDraft).mockReturnValue(pendingDraft)

    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    expect(useCanvasStore.getState().draftStatus).toBe('saving')

    await act(async () => {
      resolveDraft(draftResponse)
      await pendingDraft
    })
  })

  it('marks draft as saved after a successful save', async () => {
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    expect(useCanvasStore.getState().draftStatus).toBe('saved')
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(false)
    expect(useCanvasStore.getState().lastDraftSavedAt).toBe(draftResponse.createdAt)
    expect(useCanvasStore.getState().latestDraftVersionId).toBe(draftResponse.id)
  })

  it('keeps an edit made while the request was in flight, and drafts it next', async () => {
    let resolveSave: (value: typeof draftResponse) => void = () => {}
    vi.mocked(saveDesignDraft).mockImplementation(
      () => new Promise((resolve) => {
        resolveSave = resolve
      }),
    )

    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))
    await advance(100)
    expect(saveDesignDraft).toHaveBeenCalledTimes(1)

    // The user keeps editing before the first draft request comes back.
    act(() => {
      useCanvasStore
        .getState()
        .updateRoom('room-1', { position: { x: 42, y: 1.5, z: 0 } })
    })

    await act(async () => {
      resolveSave(draftResponse)
      await Promise.resolve()
    })

    // That edit is not in the draft that just landed, so it must stay dirty.
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
    expect(useCanvasStore.getState().draftStatus).toBe('dirty')

    vi.mocked(saveDesignDraft).mockResolvedValue(draftResponse)
    await advance(100)

    expect(saveDesignDraft).toHaveBeenCalledTimes(2)
    const [, layout] = vi.mocked(saveDesignDraft).mock.calls[1]
    expect(layout.rooms.find((room) => room.id === 'room-1')?.position.x).toBe(42)
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(false)
  })

  it('marks draft error when save fails', async () => {
    vi.mocked(saveDesignDraft).mockRejectedValue({
      response: { data: { error: 'Draft save failed' } },
    })
    useCanvasStore.getState().markDirty()
    renderHook(() => useAutoSave({ designId: 'design-1', debounceMs: 100 }))

    await advance(100)

    expect(useCanvasStore.getState().draftStatus).toBe('error')
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
    expect(useCanvasStore.getState().draftError).toBe('Draft save failed')
  })

  it('cleans up the debounce timer on unmount', async () => {
    useCanvasStore.getState().markDirty()
    const { unmount } = renderHook(() =>
      useAutoSave({ designId: 'design-1', debounceMs: 100 })
    )

    unmount()
    await advance(100)

    expect(saveDesignDraft).not.toHaveBeenCalled()
  })
})
