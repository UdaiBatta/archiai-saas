import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from '../../store/canvasStore'
import { EditorDock } from './EditorDock'

const tools = {
  site: <div>Site content</div>,
  views: <button type="button">Save view</button>,
  sun: <input aria-label="Time of day" type="range" />,
  floors: <div>Floors content</div>,
}

describe('EditorDock', () => {
  beforeEach(() => useCanvasStore.setState({ viewMode: '3d' }))

  it('renders the view, lens and tool groups', () => {
    render(<EditorDock preset="perspective" onPreset={() => {}} tools={tools} />)
    const dock = screen.getByRole('navigation', { name: 'Editor dock' })
    const view = within(dock).getByRole('group', { name: 'View' })
    expect(within(view).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Perspective', 'Axonometric', 'Top plan'])
    expect(within(view).getByRole('button', { name: 'Perspective' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dock).getByRole('group', { name: 'Lenses' })).toBeInTheDocument()
    const labels = (name: string) => within(within(dock).getByRole('group', { name })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(labels('Site')).toEqual(['Site'])
    expect(labels('Study')).toEqual(['Sun'])
    expect(labels('Share')).toEqual(['Views', 'Floors'])
    // The active view expands into a labelled pill.
    expect(within(view).getByRole('button', { name: 'Perspective' })).toHaveTextContent('Perspective')
  })

  it('selects the Top plan view', async () => {
    const onPreset = vi.fn()
    render(<EditorDock preset="perspective" onPreset={onPreset} />)
    await userEvent.click(screen.getByRole('button', { name: 'Top plan' }))
    expect(onPreset).toHaveBeenCalledWith('top')
  })

  it('switches the store view mode to the Zoning and Room Graph lenses', async () => {
    const user = userEvent.setup()
    render(<EditorDock preset="perspective" onPreset={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Zoning' }))
    expect(useCanvasStore.getState().viewMode).toBe('zoning')
    expect(screen.getByRole('button', { name: 'Zoning' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Room Graph' }))
    expect(useCanvasStore.getState().viewMode).toBe('graph')
  })

  it('opens one tool popover at a time, focuses it, and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<EditorDock preset="perspective" onPreset={() => {}} tools={tools} />)
    const views = screen.getByRole('button', { name: 'Views' })
    await user.click(views)
    expect(views).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Views' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save view' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Site' }))
    expect(screen.queryByRole('dialog', { name: 'Views' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Site' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Site' })).toHaveFocus()
  })

  it('closes the popover on a click outside', async () => {
    const user = userEvent.setup()
    render(<div><button type="button">Canvas</button><EditorDock preset="perspective" onPreset={() => {}} tools={tools} /></div>)
    await user.click(screen.getByRole('button', { name: 'Sun' }))
    expect(screen.getByRole('dialog', { name: 'Sun' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows only the views and Views (restore) when read-only', () => {
    render(<EditorDock preset="axo" onPreset={() => {}} tools={tools} readOnly />)
    expect(screen.getByRole('button', { name: 'Axonometric' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Views' })).toBeInTheDocument()
    for (const name of ['Zoning', 'Room Graph', 'Site', 'Sun', 'Floors']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})
