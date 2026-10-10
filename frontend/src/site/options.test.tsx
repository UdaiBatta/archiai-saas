import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from '../store/canvasStore'
import { OptionsBar } from './OptionsBar'
import { compareOptions, deleteOption, duplicateOption, parseOptions, renameOption, switchOption } from './options'
import { parseMasses, type Mass } from './siteTypes'

const square = (x: number, s: number) => [{ x, z: 0 }, { x: x + s, z: 0 }, { x: x + s, z: s }, { x, z: s }]
const tower: Mass = { id: 't', name: 'Tower', footprint: square(0, 10), floors: 10, floorHeightM: 3, baseM: 0 }
const slab: Mass = { id: 's', name: 'Slab', footprint: square(0, 20), floors: 4, floorHeightM: 3, baseM: 0 }
const site = { boundary: square(-5, 40), rules: { setbacks: [0, 0, 0, 0], maxHeightM: 25, maxCoverage: null, maxFar: 1 } }

describe('design options', () => {
  it('starts as one implicit option holding the current scheme', () => {
    const o = parseOptions({ masses: [tower] })
    expect(o.list).toHaveLength(1)
    expect(o.list[0].name).toBe('Option A')
  })

  it('duplicates, edits independently, switches back and forth', () => {
    let meta: Record<string, unknown> = { site, masses: [tower] }
    meta = duplicateOption(meta, 'b')
    expect(parseOptions(meta).activeId).toBe('b')
    meta = { ...meta, masses: [slab] } // edit option B live
    meta = switchOption(meta, 'opt-a')
    expect(parseMasses(meta.masses).map((m) => m.id)).toEqual(['t'])
    meta = switchOption(meta, 'b')
    expect(parseMasses(meta.masses).map((m) => m.id)).toEqual(['s'])
    meta = renameOption(meta, 'b', 'Slab scheme')
    const rows = compareOptions(meta)
    expect(rows.map((r) => [r.name, r.active, Math.round(r.gfa)])).toEqual([['Option A', false, 1000], ['Slab scheme', true, 1600]])
    expect(rows[0].far).toBeCloseTo(1000 / 1600)
    meta = deleteOption(meta, 'b')
    expect(parseOptions(meta).list.map((o) => o.name)).toEqual(['Option A'])
    expect(parseMasses(meta.masses).map((m) => m.id)).toEqual(['t'])
    expect(deleteOption(meta, 'opt-a')).toBe(meta) // never the last one
  })
})

describe('OptionsBar', () => {
  beforeEach(() => useCanvasStore.setState({ layoutMetadata: { site, masses: [tower] }, past: [], future: [] }))

  it('adds an option and switches with one undo step each', () => {
    render(<OptionsBar readOnly={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'New option from this one' }))
    expect(screen.getByRole('tab', { name: /Option B/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: /Option A/ }))
    expect(screen.getByRole('tab', { name: /Option A/ })).toHaveAttribute('aria-selected', 'true')
    expect(useCanvasStore.getState().past).toHaveLength(2)
    act(() => useCanvasStore.getState().undo())
    expect(screen.getByRole('tab', { name: /Option B/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('ComparePanel', () => {
  it('shows the focal number, bars per option, and flags an option over the FAR limit', async () => {
    const { ComparePanel } = await import('./ComparePanel')
    let meta: Record<string, unknown> = { site, masses: [tower] }
    meta = duplicateOption(meta, 'b')
    meta = { ...meta, masses: [{ ...slab, floors: 6 }] } // 2400 m² on a 1600 m² site: FAR 1.5 > 1
    useCanvasStore.setState({ layoutMetadata: meta })
    render(<ComparePanel />)
    fireEvent.click(screen.getByRole('radio', { name: 'FAR' }))
    expect(screen.getAllByText('1.50')[0]).toBeInTheDocument()
    expect(screen.getByText(/limit 1.00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Option A/ }))
    expect(parseOptions(useCanvasStore.getState().layoutMetadata).activeId).toBe('opt-a')
  })
})
