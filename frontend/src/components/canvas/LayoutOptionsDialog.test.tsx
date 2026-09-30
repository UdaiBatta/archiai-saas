import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchLayoutOptions } from '../../services/mvp.service'
import { DEFAULT_FLOOR, INITIAL_ROOMS, useCanvasStore } from '../../store/canvasStore'
import type { LayoutPlan, OptionsResponse, RequirementsSpec } from '../../types/contracts'
import { LayoutOptionsDialog } from './LayoutOptionsDialog'

vi.mock('../../services/mvp.service', () => ({ fetchLayoutOptions: vi.fn() }))

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

function plan(prefix: string): LayoutPlan {
  return {
    plot: { width_m: 9, depth_m: 12, facing: 'east' },
    rooms: [
      { id: `${prefix}-bed`, type: 'bedroom', label: 'Bedroom', x: 0, y: 0, w: 4, h: 4, rotation: 0 },
      { id: `${prefix}-liv`, type: 'living_room', label: 'Living', x: 4, y: 0, w: 5, h: 4, rotation: 0 },
    ],
    walls: [],
    doors: [],
  }
}

const response: OptionsResponse = {
  options: [
    { layout: plan('a'), score: 96, highlights: ['Highest score', 'Kitchen next to dining'] },
    { layout: plan('b'), score: 90, highlights: ['Corner living room', 'Bathrooms back to back'] },
    { layout: plan('c'), score: 88, highlights: ['Least corridor space (4 m²)', 'Balcony off the living room'] },
  ],
  warnings: [],
}

beforeEach(() => {
  vi.mocked(fetchLayoutOptions).mockReset()
  useCanvasStore.setState({
    rooms: INITIAL_ROOMS.map((r) => ({ ...r, floorId: DEFAULT_FLOOR.id, floorLevel: 0 })),
    floors: [DEFAULT_FLOOR],
    layoutMetadata: { mvpRequirements: requirements, mvpQuality: { valid: true, score: 81 } },
    past: [],
    future: [],
  })
})

describe('LayoutOptionsDialog', () => {
  it('shows a loading state, then the current plan and three scored options', async () => {
    let resolve!: (value: OptionsResponse) => void
    vi.mocked(fetchLayoutOptions).mockReturnValue(new Promise((r) => { resolve = r }))
    render(<LayoutOptionsDialog open onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Generating options')
    expect(fetchLayoutOptions).toHaveBeenCalledWith(requirements, expect.any(AbortSignal))
    resolve(response)

    expect(await screen.findByText('Current plan')).toBeInTheDocument()
    expect(screen.getByText('Score 81/100')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Use this option' })).toHaveLength(3)
    expect(screen.getByText('Score 96/100')).toBeInTheDocument()
    expect(screen.getByText('Corner living room')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the API error', async () => {
    vi.mocked(fetchLayoutOptions).mockRejectedValue(new Error('boom'))
    render(<LayoutOptionsDialog open onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('explains when the plan has no brief, without calling the API', () => {
    useCanvasStore.setState({ layoutMetadata: {} })
    render(<LayoutOptionsDialog open onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('no brief')
    expect(fetchLayoutOptions).not.toHaveBeenCalled()
  })

  it('applies an option as one undoable edit', async () => {
    vi.mocked(fetchLayoutOptions).mockResolvedValue(response)
    const onClose = vi.fn()
    const before = useCanvasStore.getState().rooms.map((r) => r.id)
    render(<LayoutOptionsDialog open onClose={onClose} />)

    const buttons = await screen.findAllByRole('button', { name: 'Use this option' })
    await userEvent.click(buttons[1])

    const ids = useCanvasStore.getState().rooms.map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['b-bed', 'b-liv']))
    expect(useCanvasStore.getState().layoutMetadata.mvpRequirements).toEqual(requirements)
    expect(useCanvasStore.getState().past).toHaveLength(1)
    expect(onClose).toHaveBeenCalled()

    useCanvasStore.getState().undo()
    expect(useCanvasStore.getState().rooms.map((r) => r.id)).toEqual(before)
  })

  it('closes on Escape and keeps Tab focus inside the dialog', async () => {
    vi.mocked(fetchLayoutOptions).mockResolvedValue(response)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<LayoutOptionsDialog open onClose={onClose} />)
    await screen.findAllByRole('button', { name: 'Use this option' })

    const close = screen.getByRole('button', { name: 'Close options' })
    await waitFor(() => expect(close).toHaveFocus())
    await user.tab({ shift: true })
    expect(screen.getAllByRole('button', { name: 'Use this option' })[2]).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
