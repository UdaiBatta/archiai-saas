import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import { commitMasses, currentMasses, previewMasses } from './massStore'
import type { Mass } from './siteTypes'

const tower: Mass = {
  id: 'm1',
  name: 'Tower',
  footprint: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }],
  floors: 5,
  floorHeightM: 3,
  baseM: 0,
}

beforeEach(() => {
  useCanvasStore.getState().loadLayout({ version: '1.0', rooms: [] })
  useCanvasStore.getState().setMasses([tower])
})

describe('mass drags', () => {
  it('previews live, then commits one undo step', () => {
    const past = useCanvasStore.getState().past.length
    const start = currentMasses()
    previewMasses([{ ...tower, floors: 6 }])
    previewMasses([{ ...tower, floors: 7 }])
    expect(useCanvasStore.getState().past).toHaveLength(past)
    commitMasses(start, currentMasses())
    expect(currentMasses()[0].floors).toBe(7)
    expect(useCanvasStore.getState().past).toHaveLength(past + 1)
    useCanvasStore.getState().undo()
    expect(currentMasses()[0].floors).toBe(5)
  })

  it('a cancelled drag (Esc) restores the start with no undo entry', () => {
    const past = useCanvasStore.getState().past.length
    const start = currentMasses()
    previewMasses([{ ...tower, footprint: tower.footprint.map((p) => ({ x: p.x + 4, z: p.z })) }])
    commitMasses(start, start)
    expect(currentMasses()).toEqual([tower])
    expect(useCanvasStore.getState().past).toHaveLength(past)
  })
})
