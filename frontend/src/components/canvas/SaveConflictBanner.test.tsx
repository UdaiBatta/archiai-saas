import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchDesignDraft,
  getLatestProjectDesign,
  saveDesignDraft,
  saveDesignLayout,
} from '../../services/design.service'
import { DEFAULT_FLOOR, DEFAULT_FLOOR_HEIGHT, useCanvasStore, type Room } from '../../store/canvasStore'
import { SaveConflictBanner } from './SaveConflictBanner'

vi.mock('../../services/design.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/design.service')>()),
  fetchDesignDraft: vi.fn(),
  getLatestProjectDesign: vi.fn(),
  saveDesignDraft: vi.fn(),
  saveDesignLayout: vi.fn(),
}))

const room = (id: string, label: string, w = 4): Room =>
  ({
    id,
    label,
    roomType: 'bedroom',
    objectType: 'room',
    floorId: DEFAULT_FLOOR.id,
    floorLevel: 0,
    position: { x: 0, y: 1.5, z: 0 },
    size: { w, h: 3, d: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#888',
  }) as Room

const conflict = { currentRevision: 7, message: 'This design was changed somewhere else since you opened it.' }

function seed() {
  useCanvasStore.setState({
    rooms: [room('a', 'Kitchen', 5), room('b', 'Study')],
    floors: [DEFAULT_FLOOR],
    floorHeight: DEFAULT_FLOOR_HEIGHT,
    designId: 'design-1',
    designVersionId: 'version-1',
    designRevision: 4,
    layoutMetadata: {},
    saveStatus: 'unsaved',
    hasUnsavedChanges: true,
    draftStatus: 'error',
    saveConflict: conflict,
  })
}

beforeEach(() => {
  vi.mocked(getLatestProjectDesign).mockReset()
  vi.mocked(fetchDesignDraft).mockReset()
  vi.mocked(saveDesignLayout).mockReset()
  vi.mocked(saveDesignDraft).mockReset()
  seed()
})

describe('SaveConflictBanner', () => {
  it('shows nothing when there is no conflict', () => {
    useCanvasStore.setState({ saveConflict: null })
    const { container } = render(<SaveConflictBanner projectId="p1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says the plan changed elsewhere and keeps the local edits', () => {
    render(<SaveConflictBanner projectId="p1" />)
    expect(screen.getByRole('alert', { name: 'Save conflict' })).toHaveTextContent('changed somewhere else')
    expect(useCanvasStore.getState().rooms.map((r) => r.label)).toEqual(['Kitchen', 'Study'])
  })

  it('Compare lists what differs between this tab and the saved copy', async () => {
    vi.mocked(getLatestProjectDesign).mockResolvedValue({
      designId: 'design-1',
      rooms: [room('a', 'Kitchen', 3), room('c', 'Garage')],
    } as never)
    vi.mocked(fetchDesignDraft).mockResolvedValue(null)
    render(<SaveConflictBanner projectId="p1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))

    const differences = await screen.findByLabelText('Differences')
    expect(differences).toHaveTextContent('Only in your copy: Study')
    expect(differences).toHaveTextContent('Only in the saved copy: Garage')
    expect(differences).toHaveTextContent('Kitchen: resized')
  })

  it('Compare prefers the newest autosave of the other tab over the last named save', async () => {
    vi.mocked(getLatestProjectDesign).mockResolvedValue({ designId: 'design-1', rooms: [room('a', 'Kitchen', 5), room('b', 'Study')] } as never)
    vi.mocked(fetchDesignDraft).mockResolvedValue({ rooms: [room('a', 'Kitchen', 5), room('b', 'Study'), room('d', 'Balcony')] } as never)
    render(<SaveConflictBanner projectId="p1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))

    expect(await screen.findByLabelText('Differences')).toHaveTextContent('Only in the saved copy: Balcony')
  })

  it('Save as new version writes this tab on top of the current revision, then clears the conflict', async () => {
    vi.mocked(saveDesignLayout).mockResolvedValue({ designVersionId: 'version-9', revision: 8 } as never)
    vi.mocked(saveDesignDraft).mockResolvedValue({ id: 'draft-9', createdAt: '2026-10-14T10:00:00Z', revision: 9 } as never)
    render(<SaveConflictBanner projectId="p1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }))

    await waitFor(() => expect(useCanvasStore.getState().saveConflict).toBeNull())
    const [, savedLayout, options] = vi.mocked(saveDesignLayout).mock.calls[0]
    expect(options).toMatchObject({ baseRevision: 7, versionName: 'Saved over a newer copy' })
    expect(savedLayout.rooms.map((r) => r.label)).toEqual(['Kitchen', 'Study'])
    // The autosave draft is brought in step, on top of the version just saved.
    expect(vi.mocked(saveDesignDraft).mock.calls[0][2]).toEqual({ baseRevision: 8 })
    const state = useCanvasStore.getState()
    expect(state.designRevision).toBe(9)
    expect(state.saveStatus).toBe('saved')
    expect(state.hasUnsavedChanges).toBe(false)
    expect(state.rooms.map((r) => r.label)).toEqual(['Kitchen', 'Study'])
  })

  it('if it changed again while saving, it says so and offers the choices again', async () => {
    vi.mocked(saveDesignLayout).mockRejectedValue({
      response: { status: 409, data: { code: 'REVISION_CONFLICT', error: 'again', currentRevision: 11 } },
    })
    render(<SaveConflictBanner projectId="p1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Save as new version' }))

    expect(await screen.findByText(/changed again while saving/)).toBeInTheDocument()
    expect(useCanvasStore.getState().saveConflict?.currentRevision).toBe(11)
    expect(useCanvasStore.getState().hasUnsavedChanges).toBe(true)
    expect(saveDesignDraft).not.toHaveBeenCalled()
  })

  it('Reload asks before discarding, and does nothing if the user declines', () => {
    const onReload = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    render(<SaveConflictBanner projectId="p1" onReload={onReload} />)

    confirm.mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).not.toHaveBeenCalled()

    confirm.mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })
})
