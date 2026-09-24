import { useState } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import {
  BEGINNER_COMPONENTS,
  PROFESSIONAL_COMPONENTS,
  type CanvasObjectType,
  type ComponentDefinition,
} from '../../store/componentRegistry'

const ICONS: Record<string, JSX.Element> = {
  select: <path d="M5 3l14 7-6 2-2 6z" />,
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
  measure: (
    <>
      <path d="M3 8l5-5 13 13-5 5z" />
      <path d="M8 7l1.5 1.5M11 10l1.5 1.5M14 13l1.5 1.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
}

interface ToolDef {
  key: string
  label: string
  shortcut?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
}

function ToolButton({
  tool,
  hovered,
  setHovered,
  labeled,
}: {
  tool: ToolDef
  hovered: string | null
  setHovered: (key: string | null) => void
  labeled: boolean
}) {
  return (
    <div
      className="relative flex"
      onMouseEnter={() => setHovered(tool.key)}
      onMouseLeave={() => setHovered(null)}
    >
      <button
        type="button"
        aria-label={tool.label}
        onClick={tool.onClick}
        disabled={tool.disabled}
        className={`flex items-center justify-center rounded-md transition-colors ${
          labeled ? 'h-10 w-12 flex-col gap-0.5' : 'h-9 w-9'
        } ${
          tool.active
            ? 'bg-accent-soft text-accent-bright ring-1 ring-accent-bright/45'
            : tool.disabled
              ? 'text-graphite-500'
              : 'text-muted-light hover:bg-ink/10 hover:text-ink'
        }`}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONS[tool.key] ?? ICONS.generic}
        </svg>
        {labeled && (
          <span className="max-w-full truncate px-0.5 text-[8px] font-medium leading-none">
            {tool.label}
          </span>
        )}
      </button>
      {!labeled && hovered === tool.key && (
        <div className="absolute left-11 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-graphite-900 shadow-lg">
          <span className="text-xs font-semibold">{tool.label}</span>
          {tool.shortcut && (
            <span className="rounded bg-graphite-800 px-1 py-0.5 font-mono text-[10px] font-semibold text-graphite-100">
              {tool.shortcut}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function componentTool(
  definition: ComponentDefinition,
  placementMode: CanvasObjectType | null,
  armPlacement: (type: CanvasObjectType) => void,
): ToolDef {
  return {
    key: definition.type,
    label: definition.label,
    active: placementMode === definition.type,
    onClick: () => armPlacement(definition.type),
  }
}

export function ToolRail({ modelStage = false }: { modelStage?: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
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
    setMoreOpen(false)
  }

  const tools: ToolDef[] = [
    {
      key: 'select',
      label: 'Select',
      active: placementMode === null && !showDimensions && !measureMode,
      onClick: () => {
        if (measureMode) toggleMeasureMode()
        setPlacementMode(null)
        setShowDimensions(false)
        setMoreOpen(false)
      },
    },
    ...BEGINNER_COMPONENTS.filter((definition) => modelStage ? definition.type === 'furniture' : definition.type === 'room').map((definition) =>
      componentTool(definition, placementMode, armPlacement),
    ),
    {
      key: 'measure',
      label: 'Measure',
      shortcut: 'Alt',
      active: measureMode,
      onClick: () => {
        setPlacementMode(null)
        setShowDimensions(false)
        toggleMeasureMode()
        setMoreOpen(false)
      },
    },
    {
      key: 'more',
      label: 'More', // the full name was cut off under a 48 px button
      active: moreOpen,
      onClick: () => setMoreOpen((value) => !value),
    },
    {
      key: 'undo',
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      disabled: !canUndo,
      onClick: () => undo(),
    },
    {
      key: 'redo',
      label: 'Redo',
      shortcut: 'Ctrl+Shift+Z',
      disabled: !canRedo,
      onClick: () => redo(),
    },
  ]

  // Same labeled panel in every view — icon-only + hover tooltip used to be
  // 3D/zoning/graph-only, which made tool selection look and behave
  // differently per view for no functional reason.
  const labeled = true
  const primaryTools = tools.slice(0, -2)
  const historyTools = tools.slice(-2)

  return (
    <div
      aria-label="Editor tools"
      className={`absolute bottom-12 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center rounded-xl border border-ink/10 bg-[#1b1c1d]/95 px-1 py-1.5 shadow-xl backdrop-blur`}
    >
      <div className="flex items-center gap-0.5">
        {primaryTools.map((tool) => (
          <ToolButton
            key={tool.key}
            tool={tool}
            hovered={hovered}
            setHovered={setHovered}
            labeled={labeled}
          />
        ))}
      </div>
      <div className="ml-1 flex items-center gap-0.5 border-l border-ink/10 pl-1">
        {historyTools.map((tool) => (
          <ToolButton
            key={tool.key}
            tool={tool}
            hovered={hovered}
            setHovered={setHovered}
            labeled={labeled}
          />
        ))}
      </div>

      {moreOpen && (
        <div className="absolute bottom-16 left-0 z-30 max-h-[50vh] w-48 overflow-y-auto rounded-xl border border-ink/10 bg-graphite-800 p-1.5 shadow-2xl">
          {[...BEGINNER_COMPONENTS, ...PROFESSIONAL_COMPONENTS].filter((definition) => modelStage ? definition.type !== 'furniture' : definition.type !== 'room').map((definition) => (
            <button
              key={definition.type}
              type="button"
              onClick={() => armPlacement(definition.type)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink/80 hover:bg-ink/10 hover:text-ink"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICONS[definition.type] ?? ICONS.generic}
              </svg>
              <span>{definition.label}</span>
            </button>
          ))}
          <div className="mt-1 border-t border-ink/10 px-2.5 pb-1 pt-2">
            <p className="text-xs font-medium text-graphite-500">Furniture / FF&amp;E library</p>
            <p className="text-[10px] text-graphite-500">Coming soon</p>
          </div>
        </div>
      )}
    </div>
  )
}
