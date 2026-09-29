import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as designService from '../../services/design.service'
import type { Room } from '../../store/canvasStore'
import { ProjectCard } from './ProjectCard'
import { PlanThumbnail, groundFloorShapes } from './PlanThumbnail'

function room(partial: Partial<Room>): Room {
  return {
    id: 'r',
    label: 'Room',
    objectType: 'room',
    floorLevel: 0,
    position: { x: 2, y: 1.5, z: 2 },
    size: { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#fff',
    ...partial,
  } as Room
}

describe('groundFloorShapes', () => {
  it('keeps only the lowest floor and skips walls and doors', () => {
    const shapes = groundFloorShapes([
      room({ id: 'living' }),
      room({ id: 'upstairs', floorLevel: 1 }),
      room({ id: 'wall', objectType: 'wall' }),
    ])
    expect(shapes.map((s) => s.id)).toEqual(['living'])
  })

  it('treats position as the centre and swaps w/d for a quarter-turned room', () => {
    const [shape] = groundFloorShapes([
      room({ position: { x: 5, y: 1.5, z: 10 }, size: { w: 6, h: 3, d: 2 }, rotation: { x: 0, y: 90, z: 0 } }),
    ])
    expect(shape.points[0]).toEqual({ x: 4, z: 7 })
    expect(shape.points[2]).toEqual({ x: 6, z: 13 })
  })

  it('reads the floor from floorId when floorLevel is missing', () => {
    const shapes = groundFloorShapes([
      room({ id: 'a', floorLevel: undefined, floorId: 'floor_1' }),
      room({ id: 'b', floorLevel: undefined, floorId: 'floor_2' }),
    ])
    expect(shapes.map((s) => s.id)).toEqual(['a'])
  })

  it('draws polygon rooms by their outline', () => {
    const polygonVertices = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }]
    expect(groundFloorShapes([room({ polygonVertices })])[0].points).toEqual(polygonVertices)
  })
})

describe('PlanThumbnail', () => {
  it('draws one outlined shape per ground-floor room', () => {
    const { container } = render(
      <PlanThumbnail rooms={[room({ id: 'a' }), room({ id: 'b', position: { x: 6, y: 1.5, z: 2 } }), room({ id: 'c', floorLevel: 1 })]} />,
    )
    expect(screen.getByTestId('plan-thumbnail')).toBeInTheDocument()
    expect(container.querySelectorAll('polygon')).toHaveLength(2)
  })

  it('shows an empty state without a layout', () => {
    render(<PlanThumbnail rooms={[]} />)
    expect(screen.getByText('No layout yet')).toBeInTheDocument()
  })
})

describe('ProjectCard', () => {
  const project = {
    id: 'p1',
    user_id: 'u1',
    title: 'Villa',
    description: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  beforeEach(() => vi.restoreAllMocks())

  it('draws the latest layout for a saved project', async () => {
    const latest = vi
      .spyOn(designService, 'getLatestProjectDesign')
      .mockResolvedValue({ version: '1', metadata: {} as never, rooms: [room({})] })
    render(<ProjectCard project={{ ...project, thumbnail_url: 'data:image/png;base64,x' }} onClick={vi.fn()} />)
    expect(await screen.findByTestId('plan-thumbnail')).toBeInTheDocument()
    expect(latest).toHaveBeenCalledWith('p1')
  })

  it('shows the empty state and fetches nothing for a draft', async () => {
    const latest = vi.spyOn(designService, 'getLatestProjectDesign')
    render(<ProjectCard project={project} onClick={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('No layout yet')).toBeInTheDocument())
    expect(latest).not.toHaveBeenCalled()
  })
})
