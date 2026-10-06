/**
 * Grouped icon toolbar; the selected item expands into a labelled pill.
 * Adapted from kokonutui "Toolbar" by @dorianbaffier (MIT,
 * https://github.com/kokonut-labs/kokonutui): app tokens instead of literal
 * colours, groups with separators, tooltips, and popover-aware ARIA. The demo's
 * "clicked!" toast and lock toggle are left out.
 */
import { type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

export interface ToolbarItem {
  id: string
  icon: ReactNode
  /** Tooltip, accessible name, and the pill text when selected. */
  label: string
  /** Shown in the tooltip after the label, e.g. 'Ctrl+Z'. */
  shortcut?: string
  active?: boolean
  /** Expand into a labelled pill while active (camera view, current tool). */
  showLabel?: boolean
  onSelect: () => void
  disabled?: boolean
  /** Set for items that open a popover: adds aria-haspopup/aria-expanded. */
  expanded?: boolean
}

export interface ToolbarGroup {
  id: string
  label: string
  items: ToolbarItem[]
}

const spring = { type: 'spring' as const, bounce: 0, duration: 0.4 }

function ToolbarButton({ item, reduced }: { item: ToolbarItem; reduced: boolean }) {
  const pill = Boolean(item.active && item.showLabel)
  return (
    <motion.button
      type="button"
      data-dock-item={item.id}
      aria-label={item.label}
      aria-keyshortcuts={item.shortcut}
      aria-pressed={item.expanded === undefined ? item.active ?? false : undefined}
      aria-haspopup={item.expanded === undefined ? undefined : 'dialog'}
      aria-expanded={item.expanded}
      disabled={item.disabled}
      onClick={item.onSelect}
      initial={false}
      animate={{ paddingLeft: pill ? 12 : 8, paddingRight: pill ? 12 : 8, gap: pill ? 6 : 0 }}
      transition={reduced ? { duration: 0 } : spring}
      className={`group relative flex h-9 shrink-0 items-center rounded-xl text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-graphite-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        pill
          ? 'bg-accent text-graphite-950'
          : item.active
            ? 'bg-ink/10 text-accent-bright'
            : 'text-muted hover:bg-ink/5 hover:text-ink'
      }`}
    >
      {item.icon}
      <AnimatePresence initial={false}>
        {pill && (
          <motion.span
            aria-hidden
            className="overflow-hidden whitespace-nowrap"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : spring}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {/* Name above the icon at once on hover or keyboard focus; not while
          the label is already showing or its popover is open. */}
      {!pill && !item.expanded && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-ink/10 bg-graphite-900 px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          {item.label}
          {item.shortcut && <span className="ml-1.5 font-mono text-muted">{item.shortcut}</span>}
        </span>
      )}
    </motion.button>
  )
}

export function Toolbar({ groups, className = '', 'aria-label': ariaLabel }: { groups: ToolbarGroup[]; className?: string; 'aria-label'?: string }) {
  // The OS setting, or the app's own Reduce motion preference (.reduce-motion on <html>).
  const reduced = (useReducedMotion() ?? false) || document.documentElement.classList.contains('reduce-motion')
  return (
    <nav
      aria-label={ariaLabel}
      className={`rounded-none border-t border-ink/10 bg-graphite-800/95 px-1 py-1 shadow-xl backdrop-blur-lg md:w-fit md:rounded-2xl md:border md:px-1.5 md:py-1.5 ${className}`}
    >
      <ul className="flex items-center gap-1 overflow-x-auto p-0.5 md:overflow-visible">
        {groups.map((group, index) => (
          <li key={group.id} className="flex shrink-0 items-center gap-1">
            {index > 0 && <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-ink/10" />}
            <div role="group" aria-label={group.label} className="flex items-center gap-0.5">
              {group.items.map((item) => <ToolbarButton key={item.id} item={item} reduced={reduced} />)}
            </div>
          </li>
        ))}
      </ul>
    </nav>
  )
}
