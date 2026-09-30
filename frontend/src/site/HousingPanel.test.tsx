import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import { HousingPanel, HousingYield } from './HousingPanel'
import { parseHousing } from './housing'
import { fixtureHousing, mockHousingFill } from './housingFixture'
import { useHousingUi } from './massStore'
import type { Mass } from './siteTypes'

const fill = vi.fn()
vi.mock('../services/housing.service', () => ({ fillHousing: (...args: unknown[]) => fill(...args) }))

const mass: Mass = {
  id: 'm1', name: 'Block', floors: 5, floorHeightM: 3.2, baseM: 0,
  footprint: [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 15 }, { x: 0, z: 15 }],
}
const stored = () => parseHousing(useCanvasStore.getState().layoutMetadata.housing).m1

beforeEach(() => {
  fill.mockReset()
  useCanvasStore.getState().loadLayout({ version: '1.0', rooms: [] })
  useHousingUi.setState({ floor: 'all', unitId: null, autoResolve: false })
})

describe('HousingYield', () => {
  it('renders totals, areas, efficiency and the mix from the fixture', () => {
    const housing = fixtureHousing()
    render(<HousingYield housing={housing} />)
    const y = housing.result.yield
    const yieldBox = screen.getByLabelText('Yield')
    expect(within(yieldBox).getByText(String(y.total_units))).toBeInTheDocument()
    expect(within(yieldBox).getByText(`${Math.round(y.gfa_m2).toLocaleString()} m²`)).toBeInTheDocument()
    expect(within(yieldBox).getByText(`${(y.efficiency * 100).toFixed(1)}%`)).toBeInTheDocument()
    expect(within(screen.getByLabelText('Mix achieved')).getAllByRole('row')).toHaveLength(4)
    expect(screen.getByText(housing.result.warnings[0])).toBeInTheDocument()
  })
})

describe('HousingPanel', () => {
  it('blocks filling until the mix totals 100%', async () => {
    render(<HousingPanel mass={mass} readOnly={false} />)
    const user = userEvent.setup()
    const studio = screen.getByRole('spinbutton', { name: 'Studio %' })
    await user.clear(studio)
    await user.type(studio, '25')
    expect(screen.getByRole('alert')).toHaveTextContent('must be 100%')
    expect(screen.getByRole('button', { name: 'Fill with housing' })).toBeDisabled()
  })

  it('fills the mass and stores request + result as one undo step', async () => {
    fill.mockImplementation(async (req) => mockHousingFill(req))
    render(<HousingPanel mass={mass} readOnly={false} />)
    const past = useCanvasStore.getState().past.length
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fill with housing' }))
    await waitFor(() => expect(stored()).toBeTruthy())
    expect(fill.mock.calls[0][0].footprint[2]).toEqual({ x: 40, y: 15 })
    expect(useCanvasStore.getState().past).toHaveLength(past + 1)
    expect(screen.getByLabelText('Yield')).toBeInTheDocument()
  })

  it('shows the API error message', async () => {
    fill.mockRejectedValue({ response: { data: { detail: 'footprint too narrow' } } })
    render(<HousingPanel mass={mass} readOnly={false} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Fill with housing' }))
    expect(await screen.findByText('footprint too narrow')).toBeInTheDocument()
  })

  it('toggles a picked unit lock, and sends locks when re-solving an out-of-date fill', async () => {
    const housing = fixtureHousing()
    useCanvasStore.getState().setHousing('m1', housing)
    const unit = housing.result.units[4]
    useHousingUi.setState({ unitId: unit.id })
    const taller = { ...mass, floors: 6 }
    render(<HousingPanel mass={taller} readOnly={false} />)
    const user = userEvent.setup()
    expect(screen.getByRole('status')).toHaveTextContent('Out of date')
    await user.click(screen.getByRole('button', { name: 'Lock' }))
    expect(stored().result.units[4].locked).toBe(true)
    expect(screen.getByRole('button', { name: 'Locked' })).toHaveAttribute('aria-pressed', 'true')
    fill.mockImplementation(async (req) => mockHousingFill(req))
    await user.click(screen.getByRole('button', { name: 'Re-solve' }))
    await waitFor(() => expect(fill).toHaveBeenCalled())
    expect(fill.mock.calls[0][0].locked_units.map((u: { id: string }) => u.id)).toEqual([unit.id])
    expect(fill.mock.calls[0][0].floors).toBe(6)
  })

  it('auto re-solves ~600 ms after the mass changes', async () => {
    vi.useFakeTimers()
    try {
      useCanvasStore.getState().setHousing('m1', fixtureHousing())
      useHousingUi.setState({ autoResolve: true })
      fill.mockImplementation(async (req) => mockHousingFill(req))
      const { rerender } = render(<HousingPanel mass={{ ...mass, floors: 6 }} readOnly={false} />)
      vi.advanceTimersByTime(400)
      rerender(<HousingPanel mass={{ ...mass, floors: 7 }} readOnly={false} />)
      vi.advanceTimersByTime(400)
      expect(fill).not.toHaveBeenCalled()
      vi.advanceTimersByTime(250)
      expect(fill).toHaveBeenCalledTimes(1)
      expect(fill.mock.calls[0][0].floors).toBe(7)
    } finally {
      vi.useRealTimers()
    }
  })
})
