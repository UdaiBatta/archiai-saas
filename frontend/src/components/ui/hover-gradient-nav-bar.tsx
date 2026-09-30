import { type ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

export interface HoverGradientNavItem {
  id: string
  icon: ReactNode
  /** Tooltip and accessible name (the bar shows icons only). */
  label: string
  /** Shown in the tooltip after the label, e.g. 'Ctrl+Z'. */
  shortcut?: string
  /** CSS background for the hover glow, e.g. a radial-gradient(). */
  gradient: string
  /** Tailwind classes for the icon on hover, e.g. 'group-hover:text-accent-bright'. */
  iconColor: string
  active?: boolean
  onSelect: () => void
  disabled?: boolean
  /** Defaults to `active`. */
  ariaPressed?: boolean
  /** Set for items that open a popover: adds aria-haspopup/aria-expanded. */
  expanded?: boolean
}

export interface HoverGradientNavGroup {
  id: string
  label: string
  items: HoverGradientNavItem[]
}

interface HoverGradientNavBarProps {
  groups: HoverGradientNavGroup[]
  /** Positioning; the bar itself is not fixed to the viewport. */
  className?: string
  'aria-label'?: string
}

const itemVariants: Variants = { initial: { rotateX: 0, opacity: 1 }, hover: { rotateX: -90, opacity: 0 } }
const backVariants: Variants = { initial: { rotateX: 90, opacity: 0 }, hover: { rotateX: 0, opacity: 1 } }
const glowVariants: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  hover: {
    opacity: 1,
    scale: 2,
    transition: {
      opacity: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
      scale: { duration: 0.5, type: 'spring', stiffness: 300, damping: 25 },
    },
  },
}
const sharedTransition = { type: 'spring' as const, stiffness: 100, damping: 20, duration: 0.5 }

export const ACTIVE_GLOW =
  'radial-gradient(circle, rgba(255,59,31,0.24) 0%, rgba(255,59,31,0.08) 55%, rgba(255,59,31,0) 100%)'

const faceClass =
  'flex items-center justify-center rounded-xl p-2'

function Face({ item }: { item: HoverGradientNavItem }) {
  return (
    <>
      <span
        className={`transition-colors duration-300 ${item.active ? 'text-accent-bright' : item.disabled ? '' : item.iconColor}`}
      >
        {item.icon}
      </span>
    </>
  )
}

function NavButton({ item, reduced }: { item: HoverGradientNavItem; reduced: boolean }) {
  const flip = !reduced && !item.disabled
  return (
    <motion.button
      type="button"
      data-dock-item={item.id}
      aria-label={item.label}
      aria-keyshortcuts={item.shortcut}
      aria-pressed={item.expanded === undefined ? item.ariaPressed ?? item.active ?? false : undefined}
      aria-haspopup={item.expanded === undefined ? undefined : 'dialog'}
      aria-expanded={item.expanded}
      disabled={item.disabled}
      onClick={item.onSelect}
      initial="initial"
      whileHover={flip ? 'hover' : undefined}
      style={{ perspective: '600px' }}
      className={`group relative block shrink-0 rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-graphite-800 disabled:cursor-not-allowed disabled:opacity-40 ${
        item.active ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {item.active && (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-xl" style={{ background: ACTIVE_GLOW, transform: 'scale(1.5)' }} />
      )}
      {/* Name pops above the icon at once on hover or keyboard focus (a native
          title waits a second or more); hidden while its popover is open. */}
      {!item.expanded && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2.5 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-md border border-ink/10 bg-graphite-900 px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          {item.label}
          {item.shortcut && <span className="ml-1.5 font-mono text-muted">{item.shortcut}</span>}
        </span>
      )}
      {flip ? (
        <>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-xl"
            variants={glowVariants}
            style={{ background: item.gradient, opacity: 0 }}
          />
          <motion.span
            className={`relative z-10 ${faceClass}`}
            variants={itemVariants}
            transition={sharedTransition}
            style={{ transformStyle: 'preserve-3d', transformOrigin: 'center bottom' }}
          >
            <Face item={item} />
          </motion.span>
          <motion.span
            aria-hidden
            className={`absolute inset-0 z-10 ${faceClass}`}
            variants={backVariants}
            transition={sharedTransition}
            style={{ transformStyle: 'preserve-3d', transformOrigin: 'center top', transform: 'rotateX(90deg)' }}
          >
            <Face item={item} />
          </motion.span>
        </>
      ) : (
        // Reduced motion (or disabled): no flip, no glow, colour change only.
        <span className={`relative z-10 ${faceClass}`}>
          <Face item={item} />
        </span>
      )}
    </motion.button>
  )
}

/**
 * Dock-style bar of grouped icon buttons: each flips on hover with a radial
 * glow behind it; active items keep a subtle accent glow.
 */
export function HoverGradientNavBar({ groups, className = '', 'aria-label': ariaLabel }: HoverGradientNavBarProps) {
  // The OS setting, or the app's own Reduce motion preference (Settings puts
  // .reduce-motion on <html>; CSS covers the rest, framer-motion needs this).
  const reduced = (useReducedMotion() ?? false) || document.documentElement.classList.contains('reduce-motion')
  return (
    <nav
      aria-label={ariaLabel}
      className={`rounded-none border-t border-ink/10 bg-graphite-800/95 px-1 py-0.5 shadow-xl backdrop-blur-lg md:w-fit md:px-2 md:py-1.5 md:rounded-2xl md:border ${className}`}
    >
      <ul className="flex items-center gap-1 overflow-x-auto p-1 md:overflow-visible md:p-0">
        {groups.map((group, index) => (
          <li key={group.id} className="flex shrink-0 items-center gap-1">
            {index > 0 && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-ink/10" />}
            <div role="group" aria-label={group.label} className="flex items-center gap-0.5">
              {group.items.map((item) => (
                <NavButton key={item.id} item={item} reduced={reduced} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </nav>
  )
}
