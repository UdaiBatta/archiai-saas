import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planAssistantEdits, type AssistantResponse } from '../../services/mvp.service'
import { layoutPlanToCanvas } from '../../services/mvpLayoutAdapter'
import { useCanvasStore } from '../../store/canvasStore'
import type { LayoutPlan, MvpQualitySnapshot, RequirementsSpec } from '../../types/contracts'
import { AssistantPanel } from './AssistantPanel'

vi.mock('../../services/mvp.service', () => ({ planAssistantEdits: vi.fn() }))
const planMock = vi.mocked(planAssistantEdits)

const requirements: RequirementsSpec = {
  building_type: 'house',
  floors: 1,
  rooms: [{ type: 'bedroom', count: 2 }],
  adjacency: [],
  avoid_adjacency: [],
  plot: { width_m: 9, depth_m: 12 },
  facing: 'east',
  missing_info: [],
}
const room = (id: string, label: string, x: number) => ({ id, type: 'bedroom', label, x, y: 0, w: 4.5, h: 12, rotation: 0 as const, floor: 0 })
const plan: LayoutPlan = {
  plot: { width_m: 9, depth_m: 12, facing: 'east' },
  rooms: [room('r1', 'Bedroom 1', 0), room('r2', 'Bedroom 2', 4.5)],
  walls: [],
  doors: [],
}
const quality = (score: number, bad = false): MvpQualitySnapshot => ({
  score,
  valid: !bad,
  hard_violations: bad ? [{ code: 'overlap', room_ids: ['r1', 'r2'], message: 'Rooms overlap' }] : [],
  warnings: [],
})
const response = (over: Partial<AssistantResponse> = {}): AssistantResponse => ({
  summary: 'Rename Bedroom 2.',
  commands: [{ op: 'rename_room', room_id: 'r2', label: 'Kids', description: 'Rename Bedroom 2 to Kids' }],
  layout_after: { ...plan, rooms: [plan.rooms[0], { ...plan.rooms[1], label: 'Kids' }] },
  requirements_after: requirements,
  quality_before: quality(90),
  quality_after: quality(88),
  introduces_hard_violations: false,
  changed: true,
  warnings: [],
  ...over,
})

const labels = () => useCanvasStore.getState().rooms.filter((r) => r.objectType === 'room').map((r) => r.label)

async function ask(text = 'Rename bedroom 2 to Kids') {
  const user = userEvent.setup()
  render(<AssistantPanel />)
  await user.type(screen.getByRole('textbox', { name: 'Instruction' }), text)
  await user.click(screen.getByRole('button', { name: 'Ask' }))
  return user
}

describe('AssistantPanel', () => {
  beforeEach(() => {
    planMock.mockReset()
    useCanvasStore.getState().loadLayout(layoutPlanToCanvas(plan, { requirements }))
  })

  it('previews the summary, commands and quality before changing anything', async () => {
    planMock.mockResolvedValue(response())
    await ask()
    expect(screen.getByText('Rename Bedroom 2.')).toBeInTheDocument()
    expect(screen.getByText('Rename Bedroom 2 to Kids')).toBeInTheDocument()
    expect(screen.getByText(/Quality 90 → 88/)).not.toHaveClass('text-danger')
    expect(labels()).toEqual(['Bedroom 1', 'Bedroom 2'])
    const sent = planMock.mock.calls[0][0]
    expect(sent.instruction).toBe('Rename bedroom 2 to Kids')
    expect(sent.requirements).toEqual(requirements)
    expect(sent.layout.rooms.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(sent.selected_room_id).toBeUndefined()
  })

  it('flags hard violations in red', async () => {
    planMock.mockResolvedValue(response({ introduces_hard_violations: true, quality_after: quality(40, true) }))
    await ask()
    expect(screen.getByText(/Quality 90 → 40/)).toHaveClass('text-danger')
  })

  it('applies as one undoable edit', async () => {
    planMock.mockResolvedValue(response())
    const user = await ask()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(labels()).toEqual(['Bedroom 1', 'Kids'])
    expect(useCanvasStore.getState().past).toHaveLength(1)
    useCanvasStore.getState().undo()
    expect(labels()).toEqual(['Bedroom 1', 'Bedroom 2'])
  })

  it('discard changes nothing', async () => {
    planMock.mockResolvedValue(response())
    const user = await ask()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('region', { name: 'Assistant preview' })).not.toBeInTheDocument()
    expect(labels()).toEqual(['Bedroom 1', 'Bedroom 2'])
    expect(useCanvasStore.getState().past).toHaveLength(0)
  })

  it('shows explain answers as text with no Apply', async () => {
    planMock.mockResolvedValue(response({
      summary: '',
      commands: [{ op: 'explain', text: 'The balcony is too narrow.', description: 'The balcony is too narrow.' }],
      changed: false,
    }))
    await ask('Why is the balcony flagged?')
    expect(screen.getByText('The balcony is too narrow.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })

  it('shows the server error message', async () => {
    planMock.mockRejectedValue({ response: { data: { error: 'The assistant is busy right now; try again in a minute.' } } })
    await ask()
    expect(screen.getByRole('alert')).toHaveTextContent('The assistant is busy right now; try again in a minute.')
  })

  it('shows the selected room as context and sends its id', async () => {
    useCanvasStore.getState().selectRoom('r2')
    planMock.mockResolvedValue(response())
    await ask('Make this larger')
    expect(screen.getByText('About Bedroom 2')).toBeInTheDocument()
    expect(planMock.mock.calls[0][0].selected_room_id).toBe('r2')
  })

  it('fills the box from an example chip', async () => {
    const user = userEvent.setup()
    render(<AssistantPanel />)
    await user.click(screen.getByRole('button', { name: 'Make Bedroom 2 larger' }))
    expect(screen.getByRole('textbox', { name: 'Instruction' })).toHaveValue('Make Bedroom 2 larger')
  })
})
