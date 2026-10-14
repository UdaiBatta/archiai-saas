import { describe, expect, it, vi, beforeEach } from 'vitest'

import api from './api'
import {
  fetchDesignDraft,
  revisionConflictOf,
  saveDesignDraft,
  saveDesignLayout,
  type DesignDraftResponse,
} from './design.service'
import type { CanvasLayout } from '../store/canvasStore'

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const layout: CanvasLayout = {
  version: '1.0',
  designId: 'design-1',
  designVersionId: 'version-1',
  metadata: { prompt: 'draft test', building_type: 'apartment', room_count: 1 },
  building: { floorHeight: 3.2 },
  floors: [],
  rooms: [],
}

const draftResponse: DesignDraftResponse = {
  ...layout,
  id: 'draft-version-1',
  designId: 'design-1',
  designVersionId: 'draft-version-1',
  projectId: 'project-1',
  versionNumber: 2,
  versionType: 'auto_draft',
  changeSummary: 'Auto-saved draft',
  createdAt: '2026-05-30T10:00:00.000Z',
  metadata: layout.metadata ?? {},
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.put).mockReset()
})

describe('draft design service', () => {
  it('saves a draft through the backend draft endpoint', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: draftResponse })

    const result = await saveDesignDraft('design-1', layout)

    expect(api.put).toHaveBeenCalledWith('/api/design/design-1/draft', {
      layout,
    })
    expect(result).toBe(draftResponse)
  })

  it('sends the revision a save is based on, for drafts and for named saves', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: draftResponse })

    await saveDesignDraft('design-1', layout, { baseRevision: 6 })
    await saveDesignLayout('design-1', layout, { versionName: 'v', baseRevision: 6 })

    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({ baseRevision: 6 })
    expect(vi.mocked(api.put).mock.calls[1][1]).toMatchObject({ baseRevision: 6, versionName: 'v' })
  })

  it('recognises a revision conflict (409) and nothing else', () => {
    const conflict = { response: { status: 409, data: { code: 'REVISION_CONFLICT', error: 'elsewhere', currentRevision: 9 } } }
    expect(revisionConflictOf(conflict)).toEqual({ currentRevision: 9, message: 'elsewhere' })
    expect(revisionConflictOf({ response: { status: 409, data: { code: 'CONFLICT' } } })).toBeNull()
    expect(revisionConflictOf({ response: { status: 500, data: { code: 'REVISION_CONFLICT' } } })).toBeNull()
    expect(revisionConflictOf(new Error('network'))).toBeNull()
  })

  it('fetches a draft through the backend draft endpoint', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: draftResponse })

    const result = await fetchDesignDraft('design-1')

    expect(api.get).toHaveBeenCalledWith('/api/design/design-1/draft')
    expect(result).toBe(draftResponse)
  })

  it('returns null when no draft exists', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 404 } })

    await expect(fetchDesignDraft('design-1')).resolves.toBeNull()
  })

  it('propagates non-404 draft fetch errors', async () => {
    const error = { response: { status: 500 } }
    vi.mocked(api.get).mockRejectedValue(error)

    await expect(fetchDesignDraft('design-1')).rejects.toBe(error)
  })
})
