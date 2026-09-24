import { useEffect, useState } from 'react'

import projectService, { type Project } from '../../services/project.service'
import { useCanvasStore } from '../../store/canvasStore'
import { Menubar, MenubarItem, MenubarMenu, MenubarRadioGroup, MenubarSeparator, MenubarSubmenu } from '../ui/Menubar'
import { VIEW_MODE_OPTIONS } from './ViewModeSwitcher'

export interface EditorMenubarProps {
  projectId: string
  roomCount: number
  onNewProject: () => void
  onOpenProject: (id: string) => void
  onAllProjects: () => void
  onDuplicate: () => void
  onExportImage: () => void
  onExportPdf: () => void
  onShare: () => void
  onProjectDetails: () => void
  onDelete: () => void
  onHistory: () => void
  onActivity: () => void
  optionCount: number
  activeOption: number
  onPickOption: (index: number) => void
  exportingImage: boolean
  exportingPdf: boolean
  duplicating: boolean
  deleting: boolean
}

const RECENT_LIMIT = 5

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

  const exporting = props.exportingImage || props.exportingPdf

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
        </MenubarSubmenu>
        <MenubarItem onClick={props.onShare}>Share link…</MenubarItem>
        <MenubarSeparator />
        <MenubarItem onClick={props.onProjectDetails}>Project details…</MenubarItem>
        <MenubarItem onClick={props.onDelete} disabled={props.deleting} danger>
          {props.deleting ? 'Deleting…' : 'Delete project'}
        </MenubarItem>
      </MenubarMenu>

      <MenubarMenu label="Edit">
        <MenubarItem onClick={undo} disabled={!canUndo} shortcut="Ctrl Z">Undo</MenubarItem>
        <MenubarItem onClick={redo} disabled={!canRedo} shortcut="Ctrl ⇧ Z">Redo</MenubarItem>
      </MenubarMenu>

      <MenubarMenu label="View" disabled={!hasPlan}>
        <MenubarRadioGroup value={viewMode} onChange={setViewMode} options={VIEW_MODE_OPTIONS} />
      </MenubarMenu>

      <MenubarMenu label="Plan">
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
