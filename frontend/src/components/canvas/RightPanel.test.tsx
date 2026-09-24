import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_FLOOR, useCanvasStore, type Room } from '../../store/canvasStore'
import { RightPanel } from './RightPanel'

function room(partial: Partial<Room>): Room {
  return {
    id: partial.id ?? 'r1',
    label: partial.label ?? 'Room',
    objectType: 'room',
    roomType: partial.roomType ?? 'living_room',
    floorId: DEFAULT_FLOOR.id,
    floorLevel: 0,
    position: partial.position ?? { x: 2, y: 1.5, z: 2 },
    size: partial.size ?? { w: 4, h: 3, d: 4 },
    rotation: { x: 0, y: 0, z: 0 },
    color: '#5F6E88',
  } as Room
}

const EAST_ORIENTATION = {
  orientation: {
    facingDirection: 'E',
    roadSide: 'E',
    entrySide: 'E',
    entryWall: 'right',
    daylightRooms: ['living_room'],
  },
  designParams: { plotWidthM: 14, plotDepthM: 18, orientation: 'E' },
  programConstraints: {
    avoidPairs: [['bathroom', 'kitchen']],
    daylightRooms: ['living_room'],
  },
}

const PROGRAM_VALIDATION = {
  ...EAST_ORIENTATION,
  programValidation: {
    version: 1,
    overallStatus: 'failed',
    summary: {
      requestedSpaceCount: 14,
      generatedSpaceCount: 14,
      missingSpaceCount: 0,
      extraSpaceCount: 0,
      satisfiedCount: 1,
      warningCount: 0,
      failedCount: 1,
      notEvaluatedCount: 0,
    },
    spaces: [
      {
        id: 'request-kitchen',
        originalLabel: 'closed kitchen',
        normalizedType: 'kitchen',
        requestedCount: 1,
        generatedCount: 1,
        status: 'satisfied',
      },
    ],
    missingSpaces: [],
    extraSpaces: [],
    constraintChecks: [
      {
        id: 'kitchen-laundry',
        relationType: 'adjacent',
        strength: 'MUST',
        nodeA: 'Kitchen',
        nodeB: 'Laundry',
        label: 'Must be adjacent: Kitchen / Laundry',
        status: 'failed',
        reason: 'prompt adjacency',
      },
    ],
  },
}

beforeEach(() => {
  useCanvasStore.setState({
    rooms: [],
    floors: [{ ...DEFAULT_FLOOR, footprint: { x: 0, z: 0, w: 14, d: 18 } }],
    selectedFloor: 0,
    viewMode: 'floor_plan',
    selectedId: null,
    layoutMetadata: EAST_ORIENTATION,
    activityLog: [],
    placementMode: null,
  })
})

describe('RightPanel site & orientation', () => {
  it('shows facing, entry side, road side, and plot in the no-selection state', () => {
    render(<RightPanel />)

    const site = screen.getByTestId('site-orientation-block')
    expect(site).toHaveTextContent('Facing')
    expect(site).toHaveTextContent('East')
    expect(site).toHaveTextContent('Road side')
    expect(site).toHaveTextContent('14.0 × 18.0 m')
  })

  it('runs daylight and exterior-wall checks for the selected room', () => {
    // Living room touching the west footprint edge — exterior wall satisfied.
    useCanvasStore.setState({
      rooms: [room({ id: 'lr', label: 'Living Room', position: { x: 2, y: 1.5, z: 5 } })],
      selectedId: 'lr',
    })
    render(<RightPanel />)

    const checks = screen.getByTestId('room-checks')
    expect(checks).toHaveTextContent('Exterior wall')
    expect(checks).toHaveTextContent('Daylight priority')
    expect(checks.textContent?.match(/Satisfied/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('flags an interior daylight-priority room with a warning', () => {
    useCanvasStore.setState({
      rooms: [room({ id: 'lr', label: 'Living Room', position: { x: 7, y: 1.5, z: 9 } })],
      selectedId: 'lr',
    })
    render(<RightPanel />)

    expect(screen.getByTestId('room-checks')).toHaveTextContent('Warning')
  })

  it('reports avoid-adjacency status for a kitchen next to a bathroom', () => {
    useCanvasStore.setState({
      rooms: [
        room({ id: 'k', label: 'Kitchen', roomType: 'kitchen', position: { x: 2, y: 1.5, z: 2 } }),
        room({ id: 'b', label: 'Bathroom', roomType: 'bathroom', position: { x: 6, y: 1.5, z: 2 } }),
      ],
      selectedId: 'k',
      layoutMetadata: {
        ...useCanvasStore.getState().layoutMetadata,
        mvpEdges: [{ rooms: ['b', 'k'], kind: 'wall' }],
      },
    })
    render(<RightPanel />)

    const checks = screen.getByTestId('room-checks')
    expect(checks).toHaveTextContent('Kept apart from bathroom')
    expect(checks).toHaveTextContent('Warning')
  })

  it('shows Program Check in the no-selection state', () => {
    useCanvasStore.setState({ layoutMetadata: PROGRAM_VALIDATION })
    render(<RightPanel />)

    const check = screen.getByTestId('program-check')
    expect(check).toHaveTextContent('Program Check')
    expect(check).toHaveTextContent('Requested')
    expect(check).toHaveTextContent('Generated')
    expect(check).toHaveTextContent('Kitchen / Laundry')
    expect(check).toHaveTextContent('Failed')
  })

  it('keeps selected-room constraint results visible in 3D', () => {
    useCanvasStore.setState({
      rooms: [
        room({
          id: 'k',
          label: 'Kitchen',
          roomType: 'kitchen',
        }),
      ],
      selectedId: 'k',
      viewMode: '3d',
      layoutMetadata: PROGRAM_VALIDATION,
    })
    render(<RightPanel />)

    const check = screen.getByTestId('program-check')
    expect(check).toHaveTextContent('Constraint Check')
    expect(check).toHaveTextContent('closed kitchen')
    expect(check).toHaveTextContent('Kitchen / Laundry')
  })

  it('shows canonical MVP quality without replacing Program Check', () => {
    useCanvasStore.setState({
      layoutMetadata: {
        ...PROGRAM_VALIDATION,
        pipeline: 'mvp',
        mvpQuality: {
          valid: true,
          score: 88,
          hard_violations: [],
          warnings: [],
        },
      },
    })
    render(<RightPanel />)

    expect(screen.getByTestId('quality-panel')).toHaveTextContent('88')
    expect(screen.getByTestId('quality-panel')).toHaveTextContent('Concept quality')
    expect(screen.getByTestId('program-check')).toHaveTextContent('Program Check')
  })
})

describe('RightPanel create-3d-model CTA', () => {
  it('enters the model stage through the project callback without arming furniture', async () => {
    const user = userEvent.setup()
    useCanvasStore.setState({
      rooms: [room({ id: 'r1', label: 'Living Room' })],
    })
    const onCreateModel = vi.fn()
    render(<RightPanel onCreateModel={onCreateModel} />)
    await user.click(screen.getByTestId('create-3d-model'))
    expect(onCreateModel).toHaveBeenCalledOnce()
    expect(useCanvasStore.getState().placementMode).toBeNull()
  })

  it('is hidden while the canvas is empty', () => {
    render(<RightPanel />)
    expect(screen.queryByTestId('create-3d-model')).not.toBeInTheDocument()
  })
})
