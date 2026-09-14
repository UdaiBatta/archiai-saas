import { beforeEach, describe, expect, it, vi } from 'vitest'

import api from './api'
import {
  extractBrief,
  fetchMvpVersion,
  generateMvpLayout,
  saveMvpVersion,
  validateAndSyncMvpLayout,
  validateMvpLayout,
} from './mvp.service'
import type {
  ExtractResponse,
  GenerateMvpResponse,
  LayoutPlan,
  MvpVersionResponse,
  RequirementsSpec,
} from '../types/contracts'

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
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
  rooms: [],
  walls: [],
  doors: [],
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
})

describe('MVP pipeline service', () => {
  it('extracts a brief through the canonical endpoint', async () => {
    const response: ExtractResponse = {
      requirements,
      route: 'generate',
      questions: [],
      optional_missing: [],
      understood_summary: ['Building: House'],
    }
    vi.mocked(api.post).mockResolvedValue({ data: response })

    await expect(extractBrief('one bedroom house')).resolves.toBe(response)
    expect(api.post).toHaveBeenCalledWith(
      '/api/extract',
      { prompt: 'one bedroom house' },
      { signal: undefined },
    )
  })

  it('generates with backend aliases and explicit defaults intent', async () => {
    const response: GenerateMvpResponse = {
      requirements,
      layout,
      quality: { valid: true, score: 92, hard_violations: [], warnings: [] },
      defaults_applied: [],
      designId: 'design-1',
      designVersionId: 'version-1',
    }
    vi.mocked(api.post).mockResolvedValue({ data: response })

    await expect(
      generateMvpLayout({
        requirements,
        useDefaults: true,
        projectId: 'project-1',
        prompt: 'one bedroom house',
      }),
    ).resolves.toBe(response)
    expect(api.post).toHaveBeenCalledWith(
      '/api/generate',
      {
        requirements,
        useDefaults: true,
        projectId: 'project-1',
        prompt: 'one bedroom house',
      },
      { signal: undefined },
    )
  })

  it('validates and saves canonical geometry without canvas JSON', async () => {
    const quality = { valid: true, hard_violations: [] }
    const fullQuality = { valid: true, score: 86, hard_violations: [], warnings: [] }
    vi.mocked(api.post)
      .mockResolvedValueOnce({ data: quality })
      .mockResolvedValueOnce({ data: fullQuality })
      .mockResolvedValueOnce({ data: { id: 'version-2' } })

    await expect(validateMvpLayout(layout)).resolves.toBe(quality)
    expect(api.post).toHaveBeenNthCalledWith(1, '/api/validate', { layout })

    await expect(
      validateMvpLayout(layout, { requirements, includeVastu: true }),
    ).resolves.toBe(fullQuality)
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/api/validate?full=true&vastu=true',
      { layout, requirements },
    )

    await saveMvpVersion('project-1', { requirements, layout, quality })
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      '/api/projects/project-1/versions',
      { requirements, layout, quality },
    )
  })

  it('requests the server-rebuilt layout for live editor synchronization', async () => {
    const response = {
      layout,
      quality: { valid: true, score: 86, hard_violations: [], warnings: [] },
    }
    vi.mocked(api.post).mockResolvedValue({ data: response })

    await expect(
      validateAndSyncMvpLayout(layout, { requirements, includeVastu: true }),
    ).resolves.toBe(response)
    expect(api.post).toHaveBeenCalledWith(
      '/api/validate?full=true&includeLayout=true&vastu=true',
      { layout, requirements },
    )
  })

  it('fetches a canonical version by id', async () => {
    const response = {
      id: 'version-1',
      designId: 'design-1',
      projectId: 'project-1',
      versionNumber: 1,
      prompt: null,
      requirements,
      layout,
      quality: { valid: true, hard_violations: [] },
      createdAt: '2026-07-13T00:00:00Z',
    } satisfies MvpVersionResponse
    vi.mocked(api.get).mockResolvedValue({ data: response })

    await expect(fetchMvpVersion('version-1')).resolves.toBe(response)
    expect(api.get).toHaveBeenCalledWith('/api/versions/version-1')
  })
})
