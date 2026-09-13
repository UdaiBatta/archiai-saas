import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BriefReviewPanel } from './BriefReviewPanel'
import type { ExtractResponse } from '../../types/contracts'

const review: ExtractResponse = {
  requirements: {
    building_type: 'house',
    floors: 1,
    rooms: [{ type: 'bedroom', count: 2 }],
    adjacency: [],
    avoid_adjacency: [],
    plot: { width_m: null, depth_m: null },
    facing: null,
    missing_info: ['plot_size'],
  },
  route: 'generate',
  questions: [],
  optional_missing: ['What plot size should I use?'],
  understood_summary: ['Building: House', '2 bedrooms'],
}

describe('BriefReviewPanel', () => {
  it('shows understood facts and requires an explicit defaults action', async () => {
    const onGenerate = vi.fn()
    const user = userEvent.setup()
    render(
      <BriefReviewPanel
        review={review}
        engine="mvp"
        busy={false}
        onGenerate={onGenerate}
        onClarify={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('2 bedrooms')).toBeInTheDocument()
    expect(screen.getByText('What plot size should I use?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate with defaults' }))
    expect(onGenerate).toHaveBeenCalledWith(true, '')
  })

  it('collects every blocking clarification before re-checking', async () => {
    const onClarify = vi.fn()
    const user = userEvent.setup()
    render(
      <BriefReviewPanel
        review={{
          ...review,
          route: 'vague',
          questions: ['How many bedrooms?', 'How many bathrooms?'],
          optional_missing: [],
        }}
        engine="mvp"
        busy={false}
        onGenerate={vi.fn()}
        onClarify={onClarify}
        onCancel={vi.fn()}
      />,
    )

    const submit = screen.getByRole('button', { name: 'Re-check brief' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Answer 1'), 'three')
    await user.type(screen.getByLabelText('Answer 2'), 'two')
    await user.click(submit)
    expect(onClarify).toHaveBeenCalledWith(['three', 'two'], '')
  })

  it('explains when capability-safe fallback selection is active', () => {
    render(
      <BriefReviewPanel
        review={{ ...review, optional_missing: [] }}
        engine="established"
        busy={false}
        onGenerate={vi.fn()}
        onClarify={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/established deterministic engine/)).toBeInTheDocument()
  })
  it('passes free-text additional requirements through generation', async () => {
    const onGenerate = vi.fn()
    const user = userEvent.setup()
    render(
      <BriefReviewPanel
        review={review}
        engine="mvp"
        busy={false}
        onGenerate={onGenerate}
        onClarify={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    await user.type(
      screen.getByLabelText('Additional requirements'),
      'one more study and a garage',
    )
    await user.click(screen.getByRole('button', { name: 'Generate with defaults' }))
    expect(onGenerate).toHaveBeenCalledWith(true, 'one more study and a garage')
  })
})
