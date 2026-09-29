// Account menu (adapted from shadcn "dropdown-menu-01"): the signed-in user's
// avatar opens their name/email and links to profile, plan and settings,
// plus sign out. No invoices item: the app has no invoices yet.
import { CircleUserRound, CreditCard, LogOut, Settings, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/ui/Avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AccountMenuProps {
  name?: string
  email?: string
  onSignOut: () => void
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Show the name next to the avatar in the trigger (sidebar layout). */
  showName?: boolean
}

const LINKS: { label: string; to: string; icon: LucideIcon }[] = [
  { label: 'My profile', to: '/settings#profile', icon: CircleUserRound },
  { label: 'My plan', to: '/pricing', icon: CreditCard },
  { label: 'Settings', to: '/settings', icon: Settings },
]

const itemClass = 'cursor-pointer gap-2 p-2 font-medium'

export function AccountMenu({ name, email, onSignOut, align = 'end', side = 'bottom', showName }: AccountMenuProps) {
  const navigate = useNavigate()
  const displayName = name || email || ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex min-w-0 items-center gap-2.5 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50"
      >
        <Avatar name={displayName} size={8} />
        {showName && <span className="min-w-0 truncate text-sm text-muted">{displayName}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-72 rounded-2xl">
        <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 font-normal">
          <div className="relative">
            <Avatar name={displayName} size={10} />
            {/* Presence: you're signed in. */}
            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-ok ring-2 ring-card" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span title={name || undefined} className="truncate text-sm font-medium text-popover-foreground">{name || 'Your account'}</span>
            {email && (
              <span title={email} className="line-clamp-2 break-all text-sm text-muted-foreground">
                {email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {LINKS.map(({ label, to, icon: Icon }) => (
            <DropdownMenuItem key={label} className={itemClass} onSelect={() => navigate(to)}>
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className={itemClass} onSelect={onSignOut}>
          <LogOut size={18} aria-hidden="true" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
