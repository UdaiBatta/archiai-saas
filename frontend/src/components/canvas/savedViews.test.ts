import { describe, expect, it } from 'vitest'
import { addView, deleteView, parseSavedViews, renameView, restorableFloor, uniqueViewName, type ViewState } from './savedViews'

const state: ViewState = {
  position: [10.123456, 12, 10],
  target: [6, 0, 7.5],
  zoom: 1,
  preset: 'perspective',
  sunHour: 16.5,
  selectedFloor: 0,
  ghostFloors: true,
}

describe('savedViews', () => {
  it('round-trips through layout metadata JSON', () => {
    const views = addView([], state, 'v1', 'Street')
    const metadata = JSON.parse(JSON.stringify({ savedViews: views }))
    expect(parseSavedViews(metadata)).toEqual([
      { ...state, id: 'v1', name: 'Street', position: [10.123, 12, 10] },
    ])
  })

  it('drops malformed entries and clamps the sun', () => {
    const good = addView([], { ...state, sunHour: 30 }, 'ok')[0]
    const metadata = {
      savedViews: [good, null, { ...good, id: 'x', preset: 'fisheye' }, { ...good, id: 'y', position: [1, 2] }],
    }
    const parsed = parseSavedViews(metadata)
    expect(parsed.map((v) => v.id)).toEqual(['ok'])
    expect(parsed[0].sunHour).toBe(18)
    expect(parseSavedViews({})).toEqual([])
    expect(parseSavedViews({ savedViews: 'nope' })).toEqual([])
  })

  it('keeps names unique', () => {
    expect(uniqueViewName('Garden', ['garden', 'Garden 2'])).toBe('Garden 3')
    expect(uniqueViewName('  ', [])).toBe('View')
    let views = addView([], state, 'a')
    views = addView(views, state, 'b')
    views = deleteView(views, 'a')
    views = addView(views, state, 'c') // default "View 2" is taken
    expect(views.map((v) => v.name)).toEqual(['View 2', 'View 2 2'])
  })

  it('renames without clashing, ignoring blank names', () => {
    let views = addView(addView([], state, 'a', 'Front'), state, 'b', 'Back')
    views = renameView(views, 'b', 'front')
    expect(views[1].name).toBe('front 2')
    expect(renameView(views, 'a', '   ')).toBe(views)
    expect(renameView(views, 'a', 'Front')[0].name).toBe('Front')
  })

  it('falls back to all floors when the saved level is gone', () => {
    const view = addView([], { ...state, selectedFloor: 2 }, 'a')[0]
    expect(restorableFloor(view, [0, 1, 2])).toBe(2)
    expect(restorableFloor(view, [0, 1])).toBe('all')
  })
})
