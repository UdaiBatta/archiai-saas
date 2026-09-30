import { useEffect, useState } from 'react'

import { getApiErrorMessage } from '../../services/apiError'
import { canvasObjectsToLayoutPlan } from '../../services/mvpLayoutAdapter'
import projectService, { type FileExportFormat, type Project } from '../../services/project.service'
import { useCanvasStore, type CanvasViewMode } from '../../store/canvasStore'
import type { Connection, Facing, PlanZoneSpan } from '../../types/contracts'
import { Menubar, MenubarItem, MenubarMenu, MenubarRadioGroup, MenubarSeparator, MenubarSubmenu } from '../ui/Menubar'

export const VIEW_MODE_OPTIONS: { value: CanvasViewMode; label: string }[] = [
  { value: 'floor_plan', label: '2D Plan' },
  { value: '3d', label: '3D Edit' },
  { value: 'zoning', label: 'Zoning' },
  { value: 'graph', label: 'Room Graph' },
]

export interface EditorMenubarProps {
  projectId: string
  roomCount: number
  onNewProject: () => void
  onOpenProject: (id: string) => void
  onAllProjects: () => void
  onDuplicate: () => void
  onExportImage: () => void
  onExportPdf: () => void
  /** Reports a CAD/BIM/3D export failure (null clears it) where PNG/PDF errors show. */
  onExportError: (message: string | null) => void
  onShare: () => void
  onProjectDetails: () => void
  onDelete: () => void
  onHistory: () => void
  onActivity: () => void
  onEditBrief: () => void
  /** Plan ▸ Options…: three engine-generated alternatives for this brief. */
  onOptions: () => void
  optionCount: number
  activeOption: number
  onPickOption: (index: number) => void
  exportingImage: boolean
  exportingPdf: boolean
  duplicating: boolean
  deleting: boolean
}

const RECENT_LIMIT = 5

const FILE_EXPORTS: { format: FileExportFormat; label: string }[] = [
  { format: 'dxf', label: 'DXF — AutoCAD' },
  { format: 'ifc', label: 'IFC — Revit / BIM' },
  { format: 'glb', label: 'GLB — 3D model' },
  { format: 'obj', label: 'OBJ — 3D model (zip)' },
  { format: 'svg', label: 'SVG — vector plan' },
]

// Same plan the post-edit validation sends (useMvpQualityValidation).
function currentLayoutPlan() {
  const { rooms, floors, layoutMetadata } = useCanvasStore.getState()
  const footprint = floors[0]?.footprint // every storey shares the footprint; objects carry their floor
  if (!footprint) return null
  const facing = (layoutMetadata.mvpRequirements as { facing?: Facing } | undefined)?.facing
  const connections = Array.isArray(layoutMetadata.mvpConnections) ? (layoutMetadata.mvpConnections as Connection[]) : []
  return canvasObjectsToLayoutPlan(rooms, footprint, facing ?? 'east', connections, layoutMetadata.mvpFootprint as PlanZoneSpan | undefined)
}

/**
 * The editor's File / Edit / View / Plan menus. Everything the project page
 * can do lives here, so the top bar only keeps the title, Share and Save.
 */
export function EditorMenubar(props: EditorMenubarProps) {
  const { projectId, roomCount } = props
  const hasPlan = roomCount > 0
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const canUndo = useCanvasStore((s) => s.past.length > 0)
  const canRedo = useCanvasStore((s) => s.future.length > 0)

  // Recent projects for File ▸ Open recent. A failed fetch just leaves it empty.
  const [recent, setRecent] = useState<Project[]>([])
  useEffect(() => {
    projectService
      .list()
      .then((projects) =>
        setRecent(
          (Array.isArray(projects) ? projects : [])
            .filter((p) => p.id !== projectId)
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
            .slice(0, RECENT_LIMIT),
        ),
      )
      .catch(() => setRecent([]))
  }, [projectId])

  const [exportingFile, setExportingFile] = useState(false)
  const exporting = props.exportingImage || props.exportingPdf || exportingFile

  const exportFile = async (format: FileExportFormat) => {
    const plan = currentLayoutPlan()
    if (!plan) {
      props.onExportError('Generate a plan before exporting.')
      return
    }
    setExportingFile(true)
    props.onExportError(null)
    try {
      const { blob, filename } = await projectService.exportFile(projectId, format, plan)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      props.onExportError(getApiErrorMessage(err, `Failed to export ${format.toUpperCase()}`))
    } finally {
      setExportingFile(false)
    }
  }

  return (
    <Menubar>
      <MenubarMenu label="File">
        <MenubarItem onClick={props.onNewProject}>New project</MenubarItem>
        <MenubarSubmenu label="Open recent" disabled={recent.length === 0}>
          {recent.map((p) => (
            <MenubarItem key={p.id} onClick={() => props.onOpenProject(p.id)}>
              <span className="block max-w-56 truncate">{p.title}</span>
            </MenubarItem>
          ))}
        </MenubarSubmenu>
        <MenubarItem onClick={props.onAllProjects}>All projects</MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={props.onDuplicate} disabled={props.duplicating}>
          {props.duplicating ? 'Duplicating…' : 'Duplicate'}
        </MenubarItem>
        <MenubarSubmenu label={exporting ? 'Exporting…' : 'Export'} disabled={!hasPlan || exporting}>
          <MenubarItem onClick={props.onExportImage}>PNG image</MenubarItem>
          <MenubarItem onClick={props.onExportPdf}>PDF sheet</MenubarItem>
          <MenubarSeparator />
          {FILE_EXPORTS.map(({ format, label }) => (
            <MenubarItem key={format} onClick={() => void exportFile(format)}>{label}</MenubarItem>
          ))}
        </MenubarSubmenu>
        <MenubarItem onClick={props.onShare}>Share link…</MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={props.onProjectDetails}>Project details…</MenubarItem>
        <MenubarItem onClick={props.onDelete} disabled={props.deleting} danger>
          {props.deleting ? 'Deleting…' : 'Delete project'}
        </MenubarItem>
      </MenubarMenu>

      <MenubarMenu label="Edit">
        <MenubarItem onClick={props.onEditBrief} disabled={!hasPlan}>Edit brief…</MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={undo} disabled={!canUndo} shortcut="Ctrl Z">Undo</MenubarItem>
        <MenubarItem onClick={redo} disabled={!canRedo} shortcut="Ctrl ⇧ Z">Redo</MenubarItem>
      </MenubarMenu>

      <MenubarMenu label="View" disabled={!hasPlan}>
        <MenubarRadioGroup value={viewMode} onChange={setViewMode} options={VIEW_MODE_OPTIONS} />
      </MenubarMenu>

      <MenubarMenu label="Plan">
        <MenubarItem onClick={props.onOptions} disabled={!hasPlan}>Options…</MenubarItem>
        <MenubarSubmenu label="Layout options" disabled={props.optionCount < 2}>
          <MenubarRadioGroup
            value={props.activeOption}
            onChange={props.onPickOption}
            options={Array.from({ length: props.optionCount }, (_, i) => ({
              value: i,
              label: `Option ${i + 1}${i === 0 ? ' · recommended' : ''}`,
            }))}
          />
        </MenubarSubmenu>
        <MenubarSeparator />
        <MenubarItem onClick={props.onHistory}>Version history</MenubarItem>
        <MenubarItem onClick={props.onActivity}>Activity</MenubarItem>
      </MenubarMenu>
    </Menubar>
  )
}
