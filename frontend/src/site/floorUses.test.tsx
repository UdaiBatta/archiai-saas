import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import { FloorProgramme } from './FloorProgramme'
import { floorAt } from './MassLayer'
import { useMassUi } from './massStore'
import { parseMasses, useBands, withFloorUse, type Mass } from './siteTypes'

const tower: Mass = { id: 't', name: 'Tower A', footprint: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }], floors: 6, floorHeightM: 3, baseM: 0 }

describe('floor uses', () => {
  it('groups floors into runs and sets a range', () => {
    const m = withFloorUse(withFloorUse(tower, 0, 0, 'retail'), 1, 2, 'amenity')
    expect(useBands(m)).toEqual([
      { use: 'retail', from: 0, to: 0 }, { use: 'amenity', from: 1, to: 2 }, { use: 'residential', from: 3, to: 5 },
    ])
    expect(withFloorUse(m, 0, 5, 'residential').uses).toBeUndefined()
  })

  it('survives a save and reload, unknown uses fall back to residential', () => {
    const [m] = parseMasses([{ ...tower, uses: ['retail', 'bogus', 'office'] }])
    expect(m.uses).toEqual(['retail', 'residential', 'office'])
  })

  it('picks the floor under the pointer', () => {
    expect(floorAt(tower, 0.5)).toBe(0)
    expect(floorAt(tower, 7.1)).toBe(2)
    expect(floorAt(tower, 99)).toBe(5)
  })
})

describe('FloorProgramme', () => {
  beforeEach(() => {
    useCanvasStore.setState({ layoutMetadata: { masses: [tower] }, past: [], future: [] })
    useMassUi.setState({ selectedMassId: 't', selectedFloor: 1 })
  })

  it('applies a use to the floor picked in 3D, as one undo step', () => {
    render(<FloorProgramme mass={tower} masses={[tower]} readOnly={false} />)
    expect(screen.getByLabelText('From floor')).toHaveValue(2)
    fireEvent.change(screen.getByLabelText('Use for those floors'), { target: { value: 'office' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    const saved = parseMasses(useCanvasStore.getState().layoutMetadata.masses)[0]
    expect(useBands(saved).map((b) => b.use)).toEqual(['residential', 'office', 'residential'])
    expect(useCanvasStore.getState().past).toHaveLength(1)
  })
})
