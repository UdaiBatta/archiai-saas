import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import { SitePanel } from './SitePanel'
import { parseSiteContext, placeOnSite } from './surroundings'

const get = vi.fn()
vi.mock('../services/api', () => ({ default: { get: (...args: unknown[]) => get(...args) } }))

const square = (x: number, z: number, s: number) => [{ x, z }, { x: x + s, z }, { x: x + s, z: z + s }, { x, z: z + s }]
const site = { boundary: square(100, 100, 40), rules: { setbacks: [0, 0, 0, 0], maxHeightM: null, maxCoverage: null, maxFar: null } }

describe('placeOnSite', () => {
  it('moves map buildings to the site centre and drops those standing on the site', () => {
    const onSite = { footprint: square(-5, -5, 10), heightM: 9 } // centred on the map point
    const across = { footprint: square(40, -5, 10), heightM: 20 }
    const placed = placeOnSite([onSite, across], site.boundary)
    expect(placed).toHaveLength(1)
    expect(placed[0].footprint[0]).toEqual({ x: 160, z: 115 })
  })

  it('ignores malformed stored context', () => {
    expect(parseSiteContext(null)).toBeNull()
    expect(parseSiteContext({ buildings: [{ footprint: [{ x: 0, z: 0 }], heightM: 5 }, { footprint: square(0, 0, 5), heightM: 0 }] })?.buildings).toEqual([])
  })
})

describe('SitePanel surroundings', () => {
  beforeEach(() => {
    get.mockReset()
    useCanvasStore.setState({ layoutMetadata: { site }, past: [], future: [] })
  })

  it('loads buildings into the project in one undo step, and removes them', async () => {
    get.mockResolvedValue({ data: { buildings: [{ footprint: square(40, -5, 10), height_m: 12 }] } })
    render(<SitePanel topView={false} onRequestTop={() => {}} defaultOpen />)
    expect(screen.getByText(/No site location set/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Surroundings radius'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load from OpenStreetMap' }))
    await waitFor(() => expect(screen.getByTestId('context-status')).toHaveTextContent('1 building · © OpenStreetMap contributors'))
    expect(get.mock.calls[0][1]).toEqual({ params: { lat: 28.6, lon: 77.2, radius: 100 } })
    const stored = parseSiteContext(useCanvasStore.getState().layoutMetadata.siteContext)
    expect(stored?.buildings[0].heightM).toBe(12)
    expect(useCanvasStore.getState().past).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(useCanvasStore.getState().layoutMetadata.siteContext).toBeUndefined()
    act(() => useCanvasStore.getState().undo())
    expect(screen.getByTestId('context-status')).toBeInTheDocument()
  })

  it('reports an upstream failure', async () => {
    get.mockRejectedValue({ response: { data: { detail: 'The map service did not answer.' } } })
    render(<SitePanel topView={false} onRequestTop={() => {}} defaultOpen />)
    fireEvent.click(screen.getByRole('button', { name: 'Load from OpenStreetMap' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The map service did not answer.')
  })
})
