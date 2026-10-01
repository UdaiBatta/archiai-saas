import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Axis3d, Box, Building2, Camera, Layers, LayoutGrid, Map as MapIcon, MessageSquare, Network, Sparkles, SquareDashed, Sun, SunMedium } from 'lucide-react'
import { HoverGradientNavBar, type HoverGradientNavGroup, type HoverGradientNavItem } from '@/components/ui/hover-gradient-nav-bar'
import { useCanvasStore } from '../../store/canvasStore'
import { CAMERA_PRESETS, type CameraPreset } from './modelView'
import { useEditTools, type EditTool } from './editTools'

export type DockTool = 'site' | 'massing' | 'views' | 'sun' | 'analysis' | 'floors' | 'comments' | 'assistant'
type DockPopover = DockTool | 'more'

const glow = (rgb: string) =>
  `radial-gradient(circle, rgba(${rgb},0.18) 0%, rgba(${rgb},0.07) 50%, rgba(${rgb},0) 100%)`
const EDIT_LOOK = { gradient: glow('245,245,246'), iconColor: 'group-hover:text-ink' }
const VIEW_LOOK = { gradient: glow('255,59,31'), iconColor: 'group-hover:text-accent-bright' }
const LENS_LOOK = { gradient: glow('201,169,110'), iconColor: 'group-hover:text-warn' }
const TOOL_LOOK = { gradient: glow('143,174,148'), iconColor: 'group-hover:text-ok' }
const icon = 'h-[18px] w-[18px]'

/** A tool with open issues: red dot on the icon, the count in its label. */
const alerted = (tool: { label: string; icon: ReactNode }, count: number) =>
  count > 0
    ? {
        label: `${tool.label} · ${count} ${count === 1 ? 'issue' : 'issues'}`,
        icon: (
          <span className="relative inline-flex">
            {tool.icon}
            <span aria-hidden className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-danger ring-2 ring-graphite-800" />
          </span>
        ),
      }
    : {}

const PRESET_ITEMS: Record<CameraPreset, { label: string; icon: ReactNode }> = {
  perspective: { label: 'Perspective', icon: <Box className={icon} /> },
  axo: { label: 'Axonometric', icon: <Axis3d className={icon} /> },
  top: { label: 'Top plan', icon: <SquareDashed className={icon} /> },
}
const LENSES = [
  { id: 'zoning', label: 'Zoning', icon: <LayoutGrid className={icon} /> },
  { id: 'graph', label: 'Room Graph', icon: <Network className={icon} /> },
] as const
const TOOLS: { id: DockTool; label: string; icon: ReactNode }[] = [
  { id: 'site', label: 'Site', icon: <MapIcon className={icon} /> },
  { id: 'massing', label: 'Massing', icon: <Building2 className={icon} /> },
  { id: 'views', label: 'Views', icon: <Camera className={icon} /> },
  { id: 'sun', label: 'Sun', icon: <Sun className={icon} /> },
  { id: 'analysis', label: 'Analysis', icon: <SunMedium className={icon} /> },
  { id: 'floors', label: 'Floors', icon: <Layers className={icon} /> },
  { id: 'comments', label: 'Comments', icon: <MessageSquare className={icon} /> },
  { id: 'assistant', label: 'Assistant', icon: <Sparkles className={icon} /> },
]

/** Card style for popover content that has no panel chrome of its own. */
export const DOCK_CARD =
  'flex flex-col gap-1.5 rounded-xl border border-ink/10 bg-graphite-800/95 px-3 py-2.5 text-[11px] text-muted shadow-lg backdrop-blur'

interface EditorDockProps {
  /** The active camera view; null while a lens (zoning / graph) is on. */
  preset: CameraPreset | null
  onPreset: (preset: CameraPreset) => void
  /** Popover content per tool; tools without content get no dock item. */
  tools?: Partial<Record<DockTool, ReactNode>>
  /** Open issues per tool (e.g. zoning warnings): a red dot on its icon. */
  alerts?: Partial<Record<DockTool, number>>
  /** Only the view items and Views (restore) remain. */
  readOnly?: boolean
  /** 3D model stage: Furniture instead of Room, and no lenses. */
  modelStage?: boolean
  className?: string
}

/**
 * The editor's single bottom-centre dock: edit tools and history, camera
 * views, plan lenses and the view tools (Site, Views, Sun, Floors); the
 * add-object menu and each view tool open in a popover above it.
 */
export function EditorDock({ preset, onPreset, tools = {}, alerts, readOnly = false, modelStage = false, className = '' }: EditorDockProps) {
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const [open, setOpen] = useState<DockPopover | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const available = TOOLS.filter((tool) => tools[tool.id] && (!readOnly || tool.id === 'views'))
  const openTool = (open === 'more' && !readOnly) || available.some((tool) => tool.id === open) ? open : null
  const { edit, history, addMenu } = useEditTools({ modelStage, closeMenu: () => setOpen(null) })
  const popovers: Partial<Record<DockPopover, ReactNode>> = { ...tools, more: addMenu }
  const popoverLabel = openTool === 'more' ? 'Add object' : available.find((tool) => tool.id === openTool)?.label
  const toggle = (id: DockPopover) => (openTool === id ? close(true) : setOpen(id))
  const editItem = (tool: EditTool): HoverGradientNavItem => ({
    ...EDIT_LOOK,
    ...tool,
    ...(tool.menu ? { active: openTool === tool.id, expanded: openTool === tool.id, onSelect: () => toggle('more') } : {}),
  })

  const close = (refocus: boolean) => {
    if (refocus && openTool) {
      rootRef.current?.querySelector<HTMLElement>(`[data-dock-item="${openTool}"]`)?.focus()
    }
    setOpen(null)
  }

  useEffect(() => {
    if (!openTool) return
    const popover = popoverRef.current
    const first = popover?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ;(first ?? popover)?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openTool])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && openTool) {
      event.stopPropagation() // keep the canvas's Escape (deselect) out of it
      close(true)
    }
  }

  const groups: HoverGradientNavGroup[] = readOnly ? [] : [
    { id: 'edit', label: 'Edit', items: edit.map(editItem) },
    { id: 'history', label: 'History', items: history.map(editItem) },
  ]
  groups.push(
    {
      id: 'view',
      label: 'View',
      items: CAMERA_PRESETS.map(({ value }): HoverGradientNavItem => ({
        id: value,
        ...PRESET_ITEMS[value],
        ...VIEW_LOOK,
        active: preset === value,
        onSelect: () => onPreset(value),
      })),
    },
  )
  if (!modelStage && !readOnly) {
    groups.push({
      id: 'lenses',
      label: 'Lenses',
      items: LENSES.map((lens) => ({
        ...lens,
        ...LENS_LOOK,
        active: viewMode === lens.id,
        onSelect: () => setViewMode(lens.id),
      })),
    })
  }
  if (available.length) {
    groups.push({
      id: 'tools',
      label: 'Tools',
      items: available.map((tool) => ({
        ...tool,
        ...alerted(tool, alerts?.[tool.id] ?? 0),
        ...TOOL_LOOK,
        active: openTool === tool.id,
        expanded: openTool === tool.id,
        onSelect: () => toggle(tool.id),
      })),
    })
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className={`absolute inset-x-0 z-20 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 ${className}`}
    >
      {openTool && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={popoverLabel}
          tabIndex={-1}
          className="absolute bottom-full left-1/2 mb-2 max-h-[60vh] w-max min-w-64 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-y-auto outline-none motion-safe:animate-fade-in"
        >
          {popovers[openTool]}
        </div>
      )}
      <HoverGradientNavBar aria-label="Editor dock" groups={groups} className="w-full" />
    </div>
  )
}
