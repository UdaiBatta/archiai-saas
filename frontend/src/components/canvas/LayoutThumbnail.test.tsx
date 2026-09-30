import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Room } from '../../store/canvasStore'
import { LayoutThumbnail, layoutThumbnailDataUrl } from './LayoutThumbnail'

function room(partial: Partial<Room>): Room {
  return {
    id: partial.id ?? 'r1',
    label: partial.label ?? 'Room',
    objectType: partial.objectType ?? 'room',
    floorLevel: partial.floorLevel ?? 0,
    position: partial.position ?? { x: 0, y: 1.5, z: 0 },
    size: partial.size ?? { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#5F6E88',
  } as Room
}

describe('LayoutThumbnail', () => {
  it('draws one outline per ground-floor space, skipping walls and upper floors', () => {
    const { container } = render(
      <LayoutThumbnail
        rooms={[
          room({ id: 'a' }),
          room({ id: 'b', position: { x: 5, y: 1.5, z: 0 } }),
          room({ id: 'wall', objectType: 'wall' }),
          room({ id: 'upstairs', floorLevel: 1 }),
        ]}
      />,
    )

    expect(screen.getByTestId('layout-thumbnail')).toBeInTheDocument()
    // background sheet + 2 ground-floor spaces
    expect(container.querySelectorAll('rect')).toHaveLength(1)
    expect(container.querySelectorAll('polygon')).toHaveLength(2)
  })

  it('renders just the sheet for an empty layout', () => {
    const { container } = render(<LayoutThumbnail rooms={[]} />)
    expect(container.querySelectorAll('rect')).toHaveLength(1)
  })

  it('makes a standalone SVG preview from the plan data, whatever view is on screen', () => {
    const url = layoutThumbnailDataUrl([
      room({ id: 'a' }),
      room({ id: 'b', position: { x: 5, y: 1.5, z: 0 } }),
      room({ id: 'wall', objectType: 'wall' }),
    ])
    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    const svg = decodeURIComponent(url!.split(',')[1])
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    // background sheet + 2 spaces (the wall is not drawn)
    expect(svg.match(/<rect /g)).toHaveLength(1)
    expect(svg.match(/<polygon /g)).toHaveLength(2)
  })

  it('draws a quarter-turned room with its turned footprint', () => {
    const turned = { ...room({ id: 't', size: { w: 6, h: 3, d: 2 } }), rotation: { x: 0, y: 90, z: 0 } } as Room
    const svg = decodeURIComponent(layoutThumbnailDataUrl([turned])!.split(',')[1])
    // 6 x 2 turned 90 degrees covers 2 m east-west and 6 m north-south.
    expect(svg).toContain('points="-1,-3 1,-3 1,3 -1,3"')
  })

  it('has no preview for a plan with no rooms', () => {
    expect(layoutThumbnailDataUrl([])).toBeNull()
  })
})
