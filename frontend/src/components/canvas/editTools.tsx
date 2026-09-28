import { type ReactNode } from 'react'
import { Armchair, Ellipsis, MousePointer2, Redo2, Ruler, SquarePlus, Undo2 } from 'lucide-react'
import { useCanvasStore } from '../../store/canvasStore'
import {
  BEGINNER_COMPONENTS,
  PROFESSIONAL_COMPONENTS,
  type CanvasObjectType,
  type ComponentDefinition,
} from '../../store/componentRegistry'

const ICONS: Record<string, JSX.Element> = {
  room: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M3 9h18M9 3v18" />
    </>
  ),
  wall: <path d="M4 20V5h16v15M4 12h16" />,
  door: (
    <>
      <rect x="5" y="3" width="12" height="18" rx="0.5" />
      <path d="M9 12h.01" />
    </>
  ),
  window: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M12 5v14M4 12h16" />
    </>
  ),
  stair: <path d="M3 20v-4h4v-4h4v-4h4V4h6" />,
  corridor: (
    <>
      <path d="M5 4v16M19 4v16" />
      <path d="M5 8h14M5 16h14" />
    </>
  ),
  furniture: (
    <>
      <path d="M5 11h14v7H5z" />
      <path d="M7 11V7h10v4M7 18v2M17 18v2" />
    </>
  ),
  column: (
    <>
      <rect x="8" y="5" width="8" height="14" rx="1" />
      <path d="M6 5h12M6 19h12" />
    </>
  ),
  open_space: (
    <>
      <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
      <path d="M8 12h8" />
    </>
  ),
  lift: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="1" />
      <path d="M10 9l2-2 2 2M10 15l2 2 2-2" />
    </>
  ),
  shaft: (
    <>
      <rect x="7" y="4" width="10" height="16" rx="1" />
      <path d="M10 7h4M10 17h4" />
    </>
  ),
  floor: (
    <>
      <path d="M4 17h16" />
      <path d="M6 13h12M8 9h8" />
    </>
  ),
  generic: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 12h6" />
    </>
  ),
}

/** An Edit / History item for the dock (icon and look are added there). */
export interface EditTool {
  id: string
  label: string
  icon: ReactNode
  shortcut?: string
  active?: boolean
  disabled?: boolean
  /** Opens the add-object menu instead of acting. */
  menu?: boolean
  onSelect: () => void
}

const icon = 'h-[18px] w-[18px]'

function ComponentIcon({ type }: { type: string }) {
  return (
    <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[type] ?? ICONS.generic}
    </svg>
  )
}

/**
 * The editor's edit tools (was the ToolRail): Select, Room (Furniture on the
 * model stage), Measure, the add-object menu, Undo and Redo. `closeMenu`
 * closes the dock popover, as picking a tool closed the old More menu.
 */
export function useEditTools({ modelStage = false, closeMenu }: { modelStage?: boolean; closeMenu: () => void }) {
  const placementMode = useCanvasStore((s) => s.placementMode)
  const setPlacementMode = useCanvasStore((s) => s.setPlacementMode)
  const showDimensions = useCanvasStore((s) => s.showDimensions)
  const setShowDimensions = useCanvasStore((s) => s.setShowDimensions)
  const measureMode = useCanvasStore((s) => s.measureMode)
  const toggleMeasureMode = useCanvasStore((s) => s.toggleMeasureMode)
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const undo = useCanvasStore((s) => s.undo)
  const redo = useCanvasStore((s) => s.redo)
  const canUndo = useCanvasStore((s) => s.past.length > 0)
  const canRedo = useCanvasStore((s) => s.future.length > 0)

  const armPlacement = (type: CanvasObjectType) => {
    // Placement needs an editable canvas — zoning/graph are analysis lenses,
    // so arming a draw tool there jumps back to the 2D plan first.
    if (viewMode === 'zoning' || viewMode === 'graph') setViewMode('floor_plan')
    if (measureMode) toggleMeasureMode()
    setShowDimensions(false)
    setPlacementMode(placementMode === type ? null : type)
    closeMenu()
  }
  const componentTool = (definition: ComponentDefinition): EditTool => ({
    id: definition.type,
    label: definition.label,
    icon: definition.type === 'furniture' ? <Armchair className={icon} /> : <SquarePlus className={icon} />,
    active: placementMode === definition.type,
    onSelect: () => armPlacement(definition.type),
  })

  const edit: EditTool[] = [
    {
      id: 'select',
      label: 'Select',
      icon: <MousePointer2 className={icon} />,
      active: placementMode === null && !showDimensions && !measureMode,
      onSelect: () => {
        if (measureMode) toggleMeasureMode()
        setPlacementMode(null)
        setShowDimensions(false)
        closeMenu()
      },
    },
    ...BEGINNER_COMPONENTS.filter((definition) => modelStage ? definition.type === 'furniture' : definition.type === 'room').map(componentTool),
    {
      id: 'measure',
      label: 'Measure',
      shortcut: 'Alt',
      icon: <Ruler className={icon} />,
      active: measureMode,
      onSelect: () => {
        setPlacementMode(null)
        setShowDimensions(false)
        toggleMeasureMode()
        closeMenu()
      },
    },
    { id: 'more', label: 'More', icon: <Ellipsis className={icon} />, menu: true, onSelect: () => {} },
  ]
  const history: EditTool[] = [
    { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', icon: <Undo2 className={icon} />, disabled: !canUndo, onSelect: () => undo() },
    { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', icon: <Redo2 className={icon} />, disabled: !canRedo, onSelect: () => redo() },
  ]

  const addMenu = (
    <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-ink/10 bg-graphite-800 p-1.5 shadow-2xl">
      {[...BEGINNER_COMPONENTS, ...PROFESSIONAL_COMPONENTS].filter((definition) => modelStage ? definition.type !== 'furniture' : definition.type !== 'room').map((definition) => (
        <button
          key={definition.type}
          type="button"
          aria-pressed={placementMode === definition.type}
          onClick={() => armPlacement(definition.type)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink/80 hover:bg-ink/10 hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        >
          <ComponentIcon type={definition.type} />
          <span>{definition.label}</span>
        </button>
      ))}
      <div className="mt-1 border-t border-ink/10 px-2.5 pb-1 pt-2">
        <p className="text-xs font-medium text-graphite-500">Furniture / FF&amp;E library</p>
        <p className="text-[10px] text-graphite-500">Coming soon</p>
      </div>
    </div>
  )

  return { edit, history, addMenu }
}
