import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useCanvasStore } from '../../store/canvasStore'
import { dragToPlace, usePlacementDrag } from './PlacementGhost'

beforeEach(() => {
  useCanvasStore.setState({ placementMode: null })
  usePlacementDrag.setState({ dragging: false })
})

describe('dragToPlace', () => {
  it('starts a drag when the pointer leaves the button while pressed', () => {
    render(<button type="button" {...dragToPlace('furniture')}>Add</button>)
    const button = screen.getByRole('button')
    fireEvent.pointerDown(button, { button: 0, buttons: 1 })
    fireEvent.pointerLeave(button, { buttons: 1 })
    expect(useCanvasStore.getState().placementMode).toBe('furniture')
    expect(usePlacementDrag.getState().dragging).toBe(true)
  })

  it('does nothing for a plain hover or a released button', () => {
    render(<button type="button" {...dragToPlace('furniture')}>Add</button>)
    const button = screen.getByRole('button')
    fireEvent.pointerLeave(button, { buttons: 0 })
    fireEvent.pointerDown(button, { button: 0, buttons: 1 })
    fireEvent.pointerUp(button)
    fireEvent.pointerLeave(button, { buttons: 0 })
    expect(useCanvasStore.getState().placementMode).toBeNull()
    expect(usePlacementDrag.getState().dragging).toBe(false)
  })
})
