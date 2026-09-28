import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Axis3d, Box, Camera, Layers, LayoutGrid, Map as MapIcon, Network, SquareDashed, Sun } from 'lucide-react'
import { HoverGradientNavBar, type HoverGradientNavGroup, type HoverGradientNavItem } from '@/components/ui/hover-gradient-nav-bar'
import { useCanvasStore } from '../../store/canvasStore'
import { CAMERA_PRESETS, type CameraPreset } from './modelView'

export type DockTool = 'site' | 'views' | 'sun' | 'floors'

const glow = (rgb: string) =>
  `radial-gradient(circle, rgba(${rgb},0.18) 0%, rgba(${rgb},0.07) 50%, rgba(${rgb},0) 100%)`
const VIEW_LOOK = { gradient: glow('255,59,31'), iconColor: 'group-hover:text-accent-bright' }
const LENS_LOOK = { gradient: glow('201,169,110'), iconColor: 'group-hover:text-warn' }
const TOOL_LOOK = { gradient: glow('143,174,148'), iconColor: 'group-hover:text-ok' }
const icon = 'h-[18px] w-[18px]'

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
  { id: 'views', label: 'Views', icon: <Camera className={icon} /> },
  { id: 'sun', label: 'Sun', icon: <Sun className={icon} /> },
  { id: 'floors', label: 'Floors', icon: <Layers className={icon} /> },
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
  /** Only the view items and Views (restore) remain. */
  readOnly?: boolean
  /** Zoning / Room Graph (hidden on the 3D model stage). */
  lenses?: boolean
  className?: string
}

/**
 * The editor's bottom-centre dock: camera views, plan lenses and the
 * view tools (Site, Views, Sun, Floors), each tool in a popover above it.
 */
export function EditorDock({ preset, onPreset, tools = {}, readOnly = false, lenses = true, className = '' }: EditorDockProps) {
  const viewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  const [open, setOpen] = useState<DockTool | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const available = TOOLS.filter((tool) => tools[tool.id] && (!readOnly || tool.id === 'views'))
  const openTool = available.some((tool) => tool.id === open) ? open : null

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

  const groups: HoverGradientNavGroup[] = [
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
  ]
  if (lenses && !readOnly) {
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
        ...TOOL_LOOK,
        active: openTool === tool.id,
        expanded: openTool === tool.id,
        onSelect: () => (openTool === tool.id ? close(true) : setOpen(tool.id)),
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
          aria-label={available.find((tool) => tool.id === openTool)?.label}
          tabIndex={-1}
          className="absolute bottom-full left-1/2 mb-2 max-h-[60vh] w-64 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-y-auto outline-none motion-safe:animate-fade-in"
        >
          {tools[openTool]}
        </div>
      )}
      <HoverGradientNavBar aria-label="Editor dock" groups={groups} className="w-full" />
    </div>
  )
}
