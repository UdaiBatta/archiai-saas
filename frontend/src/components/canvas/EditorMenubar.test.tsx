import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import projectService from '../../services/project.service'
import { DEFAULT_FLOOR, useCanvasStore } from '../../store/canvasStore'
import { EditorMenubar, type EditorMenubarProps } from './EditorMenubar'

vi.mock('../../services/project.service', () => ({
  default: { list: vi.fn(), exportFile: vi.fn() },
}))

const noop = () => {}
const props: EditorMenubarProps = {
  projectId: 'project-1',
  roomCount: 3,
  onNewProject: noop,
  onOpenProject: noop,
  onAllProjects: noop,
  onDuplicate: noop,
  onExportImage: noop,
  onExportPdf: noop,
  onExportError: vi.fn(),
  onShare: noop,
  onProjectDetails: noop,
  onDelete: noop,
  onHistory: noop,
  onActivity: noop,
  onEditBrief: noop,
  onOptions: vi.fn(),
  optionCount: 0,
  activeOption: 0,
  onPickOption: noop,
  exportingImage: false,
  exportingPdf: false,
  duplicating: false,
  deleting: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(projectService.list).mockResolvedValue([])
  URL.createObjectURL = vi.fn(() => 'blob:export')
  URL.revokeObjectURL = vi.fn()
  useCanvasStore.setState({
    rooms: [],
    floors: [{ ...DEFAULT_FLOOR, footprint: { x: 0, z: 0, w: 12, d: 15 } }],
    layoutMetadata: {},
  })
})

async function openExport() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('menuitem', { name: 'File' }))
  // jsdom can't run the hover that opens submenus; use the keyboard.
  ;(await screen.findByRole('menuitem', { name: 'Export' })).focus()
  await user.keyboard('{ArrowRight}')
  return user
}

describe('EditorMenubar Plan menu', () => {
  it('opens layout options', async () => {
    const user = userEvent.setup()
    render(<EditorMenubar {...props} />)
    await user.click(screen.getByRole('menuitem', { name: 'Plan' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Options…' }))
    expect(props.onOptions).toHaveBeenCalled()
  })
})

describe('EditorMenubar export', () => {
  it('lists the CAD/BIM/3D formats and downloads the chosen one', async () => {
    vi.mocked(projectService.exportFile).mockResolvedValue({ blob: new Blob(['x']), filename: 'house.dxf' })
    render(<EditorMenubar {...props} />)
    const user = await openExport()

    for (const label of ['IFC — Revit / BIM', 'GLB — 3D model', 'OBJ — 3D model (zip)', 'SVG — vector plan']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument()
    }
    await user.click(await screen.findByRole('menuitem', { name: 'DXF — AutoCAD' }))

    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export'))
    expect(projectService.exportFile).toHaveBeenCalledWith(
      'project-1',
      'dxf',
      expect.objectContaining({ rooms: [] }),
    )
  })

  it('reports a failed export', async () => {
    vi.mocked(projectService.exportFile).mockRejectedValue(new Error('boom'))
    render(<EditorMenubar {...props} />)
    const user = await openExport()

    await user.click(await screen.findByRole('menuitem', { name: 'IFC — Revit / BIM' }))

    await waitFor(() => expect(props.onExportError).toHaveBeenLastCalledWith('Failed to export IFC'))
  })
})
