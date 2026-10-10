import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from '../../store/canvasStore'
import { RoomConnections } from './RoomConnections'

const room = (id: string, label: string): Room => ({
  id, label, roomType: 'living_room', objectType: 'room', floorLevel: 0,
  position: { x: 0, y: 1.5, z: 0 }, size: { w: 4, h: 3, d: 4 },
  rotation: { x: 0, y: 0, z: 0 }, color: '#000',
})

beforeEach(() => {
  useCanvasStore.setState({
    rooms: [room('living', 'Living Room'), room('kitchen', 'Kitchen'), room('bed', 'Bedroom')],
    layoutMetadata: {
      mvpEdges: [
        { rooms: ['kitchen', 'living'], kind: 'open' },
        { rooms: ['bed', 'living'], kind: 'door' },
      ],
    },
    activityLog: [],
    past: [],
    future: [],
  })
})

describe('RoomConnections', () => {
  it('shows how the room meets each neighbour', () => {
    render(<RoomConnections roomId="living" />)
    const kitchen = screen.getByRole('radiogroup', { name: 'Connection to Kitchen' })
    const bedroom = screen.getByRole('radiogroup', { name: 'Connection to Bedroom' })
    expect(kitchen.querySelector('[aria-checked="true"]')).toHaveTextContent('Open')
    expect(bedroom.querySelector('[aria-checked="true"]')).toHaveTextContent('Door')
  })

  it('records the chosen connection for that pair', () => {
    render(<RoomConnections roomId="living" />)
    const kitchen = screen.getByRole('radiogroup', { name: 'Connection to Kitchen' })
    fireEvent.click(kitchen.querySelector('button[title^="Solid wall"]')!)
    expect(useCanvasStore.getState().layoutMetadata.mvpConnections).toEqual([
      { room_a: 'living', room_b: 'kitchen', kind: 'wall', at: null },
    ])
    expect(kitchen.querySelector('[aria-checked="true"]')).toHaveTextContent('Wall')
  })

  it('renders nothing for a room with no neighbours', () => {
    const { container } = render(<RoomConnections roomId="nowhere" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('narrows to one pair for a wall between two rooms', () => {
    render(<RoomConnections roomId="living" onlyWith="bed" />)
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1)
    expect(screen.getByText('Living Room ↔ Bedroom')).toBeInTheDocument()
  })
})

describe('RoomConnections, rooms not joined', () => {
  it('lists an overlapping room and joins it with one click', () => {
    const at = (id: string, label: string, x: number, w: number): Room => ({ ...room(id, label), position: { x, y: 1.5, z: 0 }, size: { w, h: 3, d: 4 } })
    useCanvasStore.setState({
      rooms: [at('living', 'Living Room', 6, 4), at('dining', 'Dining', 2.2, 4)], // dining x 0.2..4.2 overlaps living x 4..8
      layoutMetadata: { mvpEdges: [] },
    })
    render(<RoomConnections roomId="living" />)
    expect(screen.getByText('Not joined')).toBeInTheDocument()
    expect(screen.getByText('overlaps 0.20 m')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    const living = useCanvasStore.getState().rooms.find((r) => r.id === 'living')!
    expect(living.position.x - living.size.w / 2).toBeCloseTo(4.2)
  })
})
