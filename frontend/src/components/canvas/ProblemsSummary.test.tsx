import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore, type Room } from '../../store/canvasStore'
import type { Violation } from '../../types/contracts'
import { ProblemsSummary } from './ProblemsSummary'
import { violationHelp } from './violationHelp'

const room = (id: string, label: string): Room => ({
  id, label, roomType: 'room', objectType: 'room', floorLevel: 0,
  position: { x: 0, y: 1.5, z: 0 }, size: { w: 4, h: 3, d: 4 },
  rotation: { x: 0, y: 0, z: 0 }, color: '#000',
})
const violation = (code: string, room_ids: string[]): Violation => ({ code, room_ids, message: code })

beforeEach(() => {
  useCanvasStore.setState({ rooms: [room('a', 'Kitchen'), room('b', 'Bedroom')], selectedId: null })
})

describe('ProblemsSummary', () => {
  it('shows nothing for a valid plan', () => {
    const { container } = render(<ProblemsSummary violations={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the first problems with their fix, and counts the rest', () => {
    render(<ProblemsSummary violations={[
      violation('unreachable', ['a']), violation('no_daylight', ['b']),
      violation('overlap', ['a', 'b']), violation('entry_inland', []),
    ]} />)
    expect(screen.getByText('4 problems to fix')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByText(violationHelp('unreachable').fix)).toBeInTheDocument()
    expect(screen.getByText('+1 more in Layout checks')).toBeInTheDocument()
  })

  it('selects the room a problem is about', () => {
    render(<ProblemsSummary violations={[violation('no_daylight', ['b'])]} />)
    fireEvent.click(screen.getByRole('button'))
    expect(useCanvasStore.getState().selectedId).toBe('b')
  })
})
