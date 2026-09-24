import { describe, expect, it } from 'vitest'

import {
  applyGenerationOverrides,
  reviewWithOverrides,
} from './mvpGenerationPolicy'
import type { ExtractResponse, RequirementsSpec } from '../types/contracts'

const requirements: RequirementsSpec = {
  building_type: 'house',
  floors: 1,
  rooms: [{ type: 'bedroom', count: 2 }],
  adjacency: [],
  avoid_adjacency: [],
  plot: { width_m: null, depth_m: 12 },
  facing: null,
  missing_info: ['plot_size', 'facing'],
}

describe('MVP generation selection policy', () => {
  it('applies valid editor overrides without mutating extraction output', () => {
    const result = applyGenerationOverrides(requirements, {
      plotWidthM: '10',
      floors: '2',
      orientation: 'N',
    })

    expect(result).toMatchObject({
      floors: 2,
      facing: 'north',
      plot: { width_m: 10, depth_m: 12 },
    })
    expect(requirements).toMatchObject({
      floors: 1,
      facing: null,
      plot: { width_m: null, depth_m: 12 },
    })
  })

  it('keeps invalid overrides out of the locked contract', () => {
    const result = applyGenerationOverrides(requirements, {
      plotWidthM: 'not-a-number',
      floors: '6',
    })

    expect(result.floors).toBe(1)
    expect(result.plot.width_m).toBeNull()
  })

  it('clones arbitrary spaces when applying overrides', () => {
    const custom = {
      ...requirements,
      building_type: 'other' as const,
      rooms: [],
      spaces: [{ space_type: 'recording_studio', count: 1 }],
    }

    const result = applyGenerationOverrides(custom, {})

    expect(result.spaces).toEqual(custom.spaces)
    expect(result.spaces).not.toBe(custom.spaces)
    expect(result.spaces?.[0]).not.toBe(custom.spaces[0])
  })

  it('updates review facts and removes questions resolved by overrides', () => {
    const review: ExtractResponse = {
      requirements,
      route: 'generate',
      questions: [],
      optional_missing: [
        'What plot size should I use?',
        'Which direction should the main entrance face?',
      ],
      understood_summary: ['Building: House', '1 floor'],
    }

    const result = reviewWithOverrides(review, {
      plotWidthM: '10',
      orientation: 'E',
    })

    expect(result.understood_summary).toContain('Plot width: 10 m')
    expect(result.understood_summary).toContain('Entry faces east')
    expect(result.optional_missing).toEqual([])
  })
})
