import { beforeEach, describe, expect, it, vi } from 'vitest'

import api from './api'
import { furnishRooms, furnitureItemsToObjects, withWindows, currentLayoutPlan, type FurnitureItem } from './furnish.service'
import { layoutPlanToCanvas } from './mvpLayoutAdapter'
import { EXAMPLE } from '../constants/examplePlan'
import { useCanvasStore } from '../store/canvasStore'
import type { LayoutPlan } from '../types/contracts'

vi.mock('./api', () => ({ default: { post: vi.fn() } }))

const bed: FurnitureItem = { id: 'furn-r1-1', room_id: 'r1', kind: 'double_bed', x: 2, y: 1.5, w: 1.6, d: 2, rotation: 90, floor: 1 }
const floors = [
  { id: 'floor_0', name: 'Ground', level: 0, elevation: 0 },
  { id: 'floor_1', name: 'First', level: 1, elevation: 3 },
]

function loadExample() {
  useCanvasStore.setState({ past: [], future: [] })
  useCanvasStore.getState().loadLayout(layoutPlanToCanvas(EXAMPLE.plan as LayoutPlan))
  useCanvasStore.setState({ past: [], future: [] })
}

const furniture = () => useCanvasStore.getState().rooms.filter((room) => room.objectType === 'furniture')

describe('furnitureItemsToObjects', () => {
  it('turns plan items into furniture objects on their floor, marked as auto-placed', () => {
    const [object] = furnitureItemsToObjects([bed], { x: 10, z: 20 }, floors, 3)
    expect(object).toMatchObject({
      id: 'furn-r1-1',
      objectType: 'furniture',
      roomType: 'double_bed',
      label: 'Double bed',
      floorLevel: 1,
      derived: 'furnish',
      hostRoomId: 'r1',
      size: { w: 1.6, d: 2 },
      rotation: { x: 0, y: 90, z: 0 },
    })
    // Plan centre + footprint origin; sits on the floor slab.
    expect(object.position.x).toBe(12)
    expect(object.position.z).toBe(21.5)
    expect(object.position.y - object.size.h / 2).toBeCloseTo(3)
  })
})

describe('withWindows', () => {
  it('recovers the engine windows from the canvas objects', () => {
    loadExample()
    const { rooms, floors: canvasFloors } = useCanvasStore.getState()
    const plan = withWindows(currentLayoutPlan()!, rooms, canvasFloors[0].footprint!)
    const expected = EXAMPLE.plan.windows ?? []
    expect(plan.windows).toHaveLength(expected.length)
    for (const window of expected) {
      const got = plan.windows!.find((candidate) => candidate.id === window.id)!
      expect(got.wall_ref).toBe(window.wall_ref)
      expect(got.offset).toBeCloseTo(window.offset, 2)
      expect(got.width).toBeCloseTo(window.width, 2)
    }
  })
})

describe('furnishRooms', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
    loadExample()
  })

  it('replaces earlier auto furniture, keeps hand-placed pieces, and undoes in one step', async () => {
    const kept = { x: 3, z: 3 }
    useCanvasStore.getState().addObjectAt('furniture', kept.x, kept.z)
    const manual = furniture()[0]
    expect(manual.derived).toBeUndefined()

    vi.mocked(api.post).mockResolvedValueOnce({ data: { items: [bed, { ...bed, id: 'furn-r1-2', kind: 'wardrobe' }], warnings: [] } })
    expect(await furnishRooms()).toEqual([])
    const [, body] = vi.mocked(api.post).mock.calls[0]
    expect((body as { layout: LayoutPlan }).layout.rooms.length).toBeGreaterThan(0)
    expect((body as { layout: LayoutPlan }).layout.windows?.length).toBeGreaterThan(0)
    expect(furniture().map((room) => room.id).sort()).toEqual([manual.id, 'furn-r1-1', 'furn-r1-2'].sort())

    vi.mocked(api.post).mockResolvedValueOnce({ data: { items: [{ ...bed, id: 'furn-r2-1', kind: 'sofa' }], warnings: ['Bedroom 2: no room for a wardrobe with 0.9 m in front'] } })
    const before = useCanvasStore.getState().past.length
    expect(await furnishRooms()).toEqual(['Bedroom 2: no room for a wardrobe with 0.9 m in front'])
    expect(furniture().map((room) => room.id).sort()).toEqual([manual.id, 'furn-r2-1'].sort())
    expect(useCanvasStore.getState().past.length).toBe(before + 1)

    useCanvasStore.getState().undo()
    expect(furniture().map((room) => room.id).sort()).toEqual([manual.id, 'furn-r1-1', 'furn-r1-2'].sort())
  })
})
