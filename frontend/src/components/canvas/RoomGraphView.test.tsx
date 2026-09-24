import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from '../../store/canvasStore'
import { RoomGraphView } from './RoomGraphView'

const room = (id: string, roomType: string, x: number): Room => ({
  id, label: id, roomType, objectType: 'room', floorLevel: 0,
  position: { x, y: 1.5, z: 0 }, size: { w: 4, h: 3, d: 4 },
  rotation: { x: 0, y: 0, z: 0 }, color: '#000',
})

beforeEach(() => {
  useCanvasStore.setState({
    rooms: [room('Living', 'living_room', 0), room('Bed', 'bedroom', 4)],
    floors: [{ id: 'floor_0', name: 'Ground', level: 0, elevation: 0, rooms: [] }],
    selectedFloor: 0,
    selectedId: null,
    layoutMetadata: { mvpEdges: [{ rooms: ['Bed', 'Living'], kind: 'door' }] },
    activityLog: [],
    past: [],
    future: [],
  })
})

describe('RoomGraphView', () => {
  it('redraws the moment a connection changes, before any server sync', () => {
    render(<RoomGraphView />)
    expect(screen.getByRole('button', { name: /Bed, Private zone, depth 1/ })).toBeInTheDocument()

    // Clicking the door line cycles it to "open".
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Bed to Living: door. Change to open' }), { button: 0 })
    expect(screen.getByRole('button', { name: 'Bed to Living: open. Change to wall' })).toBeInTheDocument()
    expect(screen.getByText('Bed is open to Living: no door for privacy.')).toBeInTheDocument()

    // And to "wall": the bedroom drops out of reach.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Bed to Living: open. Change to wall' }), { button: 0 })
    expect(screen.getByRole('button', { name: /Bed, Private zone, unreachable/ })).toBeInTheDocument()
    expect(screen.getByText("Bed can't be reached from the entrance: it has no door or opening.")).toBeInTheDocument()
  })

  it('says it is checking, not that every room is unreachable, before edge data arrives', () => {
    useCanvasStore.setState({ layoutMetadata: {}, selectedId: 'Bed' })
    render(<RoomGraphView />)
    const panel = screen.getByRole('complementary', { name: 'Access reasoning' })
    expect(panel).toHaveTextContent('Checking how the rooms connect…')
    expect(panel).not.toHaveTextContent(/can't be reached|has no route|Every room is reachable/)
  })

  it('shows the route to the selected room', () => {
    useCanvasStore.setState({ selectedId: 'Bed' })
    render(<RoomGraphView />)
    expect(screen.getByTestId('graph-route')).toHaveTextContent('Route: Living → Bed')
  })
})
