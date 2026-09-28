import { describe, expect, it } from 'vitest'

import { fitOrthoZoom, floorDisplay, floorTint, mixHex, presetView, sceneExtent, screenAxes, shadowFrustum } from './modelView'

const site = { x: 0, z: 0, w: 20, d: 10, h: 6 }
const viewport = { width: 1000, height: 800 }

describe('presetView', () => {
  it('top looks straight down on the site centre with north up', () => {
    const view = presetView('top', site, viewport)
    expect(view.target).toEqual([10, 0, 5])
    expect(view.position[0]).toBeCloseTo(10)
    expect(view.position[2]).toBeCloseTo(5, 2)
    expect(view.position[1]).toBeGreaterThan(site.h)
    // 20 m wide fills 62% of 1000 px -> 31 px/m (depth 10 m needs only 49.6).
    expect(view.zoom).toBeCloseTo(31)
    expect(screenAxes([0, 1, 0]).up).toEqual([0, 0, -1])
  })

  it('axo is an isometric from the south-east that keeps the whole box in view', () => {
    const view = presetView('axo', site, viewport)
    const [dx, dy, dz] = view.position.map((v, i) => v - view.target[i])
    expect(dx).toBeCloseTo(dy)
    expect(dz).toBeCloseTo(dy)
    expect(dx).toBeGreaterThan(0)
    // A taller building needs to zoom out further.
    expect(presetView('axo', { ...site, h: 30 }, viewport).zoom).toBeLessThan(view.zoom)
  })

  it('perspective keeps the original editor framing', () => {
    const view = presetView('perspective', site, viewport, 3)
    expect(view.target).toEqual([10, 3, 5])
    expect(view.position).toEqual([10 + 0.8 * 23, 3 + 23, 5 + 0.8 * 23])
    expect(view.zoom).toBe(1)
  })

  it('fits the narrow viewport axis', () => {
    expect(fitOrthoZoom(site, [0, 1, 0], { width: 400, height: 800 })).toBeCloseTo(0.62 * 20)
  })
})

describe('shadowFrustum', () => {
  it('covers the farthest top corner from the ground centre, with near < far', () => {
    const frustum = shadowFrustum(site)
    expect(frustum.radius).toBeGreaterThanOrEqual(Math.hypot(10, 5, 6))
    expect(frustum.near).toBeGreaterThan(0)
    expect(frustum.far - frustum.near).toBeGreaterThanOrEqual(2 * frustum.radius)
  })
})

describe('materials and floors', () => {
  it('tints floors toward off-white but keeps their hue', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    const ember = floorTint('#7A3325')
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ember.slice(i, i + 2), 16))
    expect(r).toBeGreaterThan(200)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })

  it('isolates or ghosts the other floors', () => {
    expect(floorDisplay(1, 'all', false)).toBe('active')
    expect(floorDisplay(1, 1, false)).toBe('active')
    expect(floorDisplay(2, 1, false)).toBe('hidden')
    expect(floorDisplay(2, 1, true)).toBe('ghost')
  })
})

describe('sceneExtent', () => {
  it('grows to the site boundary and the tallest mass', () => {
    const plot = { x: 0, z: 0, w: 10, d: 10 }
    expect(sceneExtent(plot, 3, null, [])).toEqual({ x: 0, z: 0, w: 10, d: 10, h: 3 })
    const site = { boundary: [{ x: -5, z: -2 }, { x: 30, z: -2 }, { x: 30, z: 40 }] }
    const tower = { footprint: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 50 }], baseM: 0, floors: 10, floorHeightM: 3.2 }
    expect(sceneExtent(plot, 3, site, [tower])).toEqual({ x: -5, z: -2, w: 35, d: 52, h: 32 })
  })
})
