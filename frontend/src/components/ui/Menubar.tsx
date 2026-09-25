import type { ReactNode } from 'react'
import { Menubar as BaseMenubar } from '@base-ui/react/menubar'
import { Menu } from '@base-ui/react/menu'

/**
 * Desktop-style menubar (File / Edit / View …) on Base UI, which supplies
 * the keyboard model: arrows move between menus and items, Esc closes,
 * submenus open to the side. These wrappers only add the app's styling so
 * the class strings live in one place.
 */

const popupClass =
  'min-w-52 origin-[var(--transform-origin)] rounded-xl border border-ink/10 bg-graphite-800 p-1 text-ink shadow-[0_18px_50px_rgba(0,0,0,0.45)] outline-none transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0'

const itemClass =
  'flex cursor-default select-none items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-[13px] outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-ink/10 data-[disabled]:opacity-40'

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-muted-light">
      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Menubar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <BaseMenubar className={`flex items-center gap-0.5 ${className}`}>{children}</BaseMenubar>
}

export function MenubarMenu({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <Menu.Root disabled={disabled}>
      <Menu.Trigger className="h-8 select-none rounded-lg px-2.5 text-[13px] font-medium text-muted outline-none hover:text-ink focus-visible:bg-ink/10 focus-visible:text-ink data-[disabled]:opacity-40 data-[popup-open]:bg-ink/10 data-[popup-open]:text-ink">
        {label}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" sideOffset={6} align="start">
          <Menu.Popup className={popupClass}>{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function MenubarItem({
  children,
  onClick,
  disabled,
  shortcut,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  shortcut?: string
  danger?: boolean
}) {
  return (
    <Menu.Item onClick={onClick} disabled={disabled} className={`${itemClass} ${danger ? 'text-danger data-[highlighted]:bg-danger/10' : ''}`}>
      <span>{children}</span>
      {shortcut && <kbd className="font-mono text-[11px] text-muted-light">{shortcut}</kbd>}
    </Menu.Item>
  )
}

export function MenubarSubmenu({ label, disabled, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  return (
    <Menu.SubmenuRoot disabled={disabled}>
      <Menu.SubmenuTrigger className={`${itemClass} w-full data-[popup-open]:bg-ink/10`}>
        {label}
        <Chevron />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" sideOffset={4} alignOffset={-4}>
          <Menu.Popup className={popupClass}>{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  )
}

export function MenubarSeparator() {
  return <Menu.Separator className="mx-2 my-1 h-px bg-ink/10" />
}

/** A set of mutually exclusive choices (the current one is ticked). */
export function MenubarRadioGroup<T extends string | number>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  disabled?: boolean
}) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      {options.map((option) => (
        <Menu.RadioItem key={option.value} value={option.value} className={`${itemClass} justify-start gap-2 pl-7 relative`}>
          <Menu.RadioItemIndicator className="absolute left-2.5 text-accent-bright">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </Menu.RadioItemIndicator>
          {option.label}
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  )
}
