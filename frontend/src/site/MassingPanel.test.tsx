import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import { MassingPanel } from './MassingPanel'
import { currentMasses, useMassUi } from './massStore'

beforeEach(() => {
  useCanvasStore.getState().loadLayout({ version: '1.0', rooms: [] })
  useCanvasStore.getState().setMasses([
    { id: 'm1', name: 'Tower', footprint: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }], floors: 5, floorHeightM: 3, baseM: 0 },
  ])
  useMassUi.setState({ selectedMassId: 'm1' })
})

describe('MassingPanel inspector', () => {
  it('commits a number field edit as one undo step, on Enter', async () => {
    render(<MassingPanel readOnly={false} topView={false} plot={null} />)
    const user = userEvent.setup()
    const past = useCanvasStore.getState().past.length
    const floors = screen.getByRole('spinbutton', { name: 'Floors' })
    await user.clear(floors)
    await user.type(floors, '12')
    expect(useCanvasStore.getState().past).toHaveLength(past)
    await user.keyboard('{Enter}')
    expect(currentMasses()[0].floors).toBe(12)
    expect(useCanvasStore.getState().past).toHaveLength(past + 1)
  })

  it('shows GFA and the zoning rows', () => {
    render(<MassingPanel readOnly={false} topView={false} plot={null} />)
    // Site GFA in the metrics, and the same floors' area in the programme rows.
    expect(screen.getAllByText('400 m²').length).toBeGreaterThan(0)
    expect(screen.getByText('Max height')).toBeInTheDocument()
  })
})
