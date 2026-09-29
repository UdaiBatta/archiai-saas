import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Check, Eye, EyeOff, Lock } from 'lucide-react'

import { Sidebar } from '@/components/layout/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PLANS } from '@/constants/plans'
import { useAuth } from '@/hooks/useAuth'
import { useHashScroll } from '@/hooks/useHashScroll'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/authStore'
import { loadPreferences, savePreferences, type Preferences } from '@/utils/preferences'

const SECTIONS = [
  { id: 'profile', title: 'Profile', description: 'Your name as it appears across ArchiAI.' },
  { id: 'security', title: 'Security', description: 'Change the password you sign in with.' },
  { id: 'preferences', title: 'Preferences', description: 'How the editor and interface behave in this browser.' },
  { id: 'plan', title: 'Plan', description: 'Your current plan and what it includes.' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const { title, description } = SECTIONS.find((s) => s.id === id)!
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-8 gap-4 border-t border-ink/10 py-8 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h2 id={`${id}-title`} className="text-base font-bold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="max-w-md">{children}</div>
    </section>
  )
}

/** Inline result of a save: a live region that is always mounted. */
function Status({ error, ok }: { error: string | null; ok: string | null }) {
  return (
    <>
      <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-ok">
        {ok && !error && (
          <>
            <Check size={16} aria-hidden="true" />
            {ok}
          </>
        )}
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </>
  )
}

function ProfileSection() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const changed = name.trim() !== '' && name.trim() !== user?.name

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!changed) return
    setError(null)
    setOk(null)
    setSaving(true)
    try {
      const updated = await authService.updateMe({ name: name.trim() })
      setUser(updated)
      setName(updated.name)
      setOk('Saved')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save your name'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section id="profile">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Input
          label="Name"
          value={name}
          maxLength={100}
          onChange={(e) => {
            setName(e.target.value)
            setOk(null)
          }}
          autoComplete="name"
        />
        <Input
          label="Email"
          value={user?.email ?? ''}
          readOnly
          trailing={<Lock size={14} aria-hidden="true" />}
          hint="Contact support to change your email."
        />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={saving} disabled={!changed}>Save changes</Button>
          <Status error={error} ok={ok} />
        </div>
      </form>
    </Section>
  )
}

function PasswordInput({ label, value, onChange, autoComplete }: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <Input
      label={label}
      type={shown ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      required
      trailing={
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="rounded p-1 text-muted-light hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      }
    />
  )
}

function SecuritySection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setOk(null)
    if (next.length < 8) return setError('New password must be at least 8 characters')
    setSaving(true)
    try {
      await authService.changePassword({ current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      setOk('Password changed')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not change your password'))
    } finally {
      setSaving(false)
    }
  }

  const edit = (set: (v: string) => void) => (value: string) => {
    set(value)
    setOk(null)
  }

  return (
    <Section id="security">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <PasswordInput label="Current password" value={current} onChange={edit(setCurrent)} autoComplete="current-password" />
        <PasswordInput label="New password" value={next} onChange={edit(setNext)} autoComplete="new-password" />
        <p className="-mt-3 text-xs text-muted-light">At least 8 characters.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" loading={saving} disabled={!current || !next}>Change password</Button>
          <Status error={error} ok={ok} />
        </div>
      </form>
    </Section>
  )
}

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = `switch-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0">
      <div>
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">{label}</label>
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted">{hint}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
          checked ? 'bg-accent' : 'bg-graphite-600'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-5 rounded-full bg-ink shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

function PreferencesSection() {
  const userId = useAuthStore((s) => s.user?.id)
  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences(userId))

  const update = (patch: Partial<Preferences>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    if (userId) savePreferences(userId, next)
  }

  return (
    <Section id="preferences">
      <div className="divide-y divide-ink/10">
        <Switch label="Snap to grid" hint="Grid snapping is on when you open a project." checked={prefs.snapToGrid} onChange={(v) => update({ snapToGrid: v })} />
        <Switch label="Reduce motion" hint="Turn off interface animations and transitions." checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
      </div>
      <p className="mt-2 text-xs text-muted-light">Saved automatically in this browser.</p>
    </Section>
  )
}

function PlanSection() {
  const [planCode, setPlanCode] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ plan_code: string }>('/api/billing/subscription')
      .then((r) => setPlanCode(r.data.plan_code))
      .catch(() => setPlanCode('free'))
  }, [])

  // The billing API calls the free tier "free"; the catalogue calls it Starter.
  const plan = PLANS.find((p) => p.id === planCode) ?? PLANS[0]

  return (
    <Section id="plan">
      <div className="rounded-xl border border-ink/10 bg-graphite-900 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-light">Current plan</p>
            <p className="mt-1 text-xl font-black text-ink" style={{ fontStretch: '125%' }}>
              {planCode ? plan.name : '…'}
            </p>
            <p className="text-sm text-muted">{plan.tagline}</p>
          </div>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-bright">Active</span>
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-ink/90 sm:grid-cols-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <Check size={14} className="flex-shrink-0 text-ok" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
        <Link
          to="/pricing"
          className="mt-5 inline-flex items-center rounded-full border border-ink/15 bg-ink/5 px-4 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          View plans
        </Link>
      </div>
    </Section>
  )
}

/** Highlights the section scrolled to in `main` (or the one in the URL hash). */
function useActiveSection(scroller: RefObject<HTMLElement>): SectionId {
  const { hash } = useLocation()
  const fromHash = SECTIONS.find((s) => `#${s.id}` === hash)?.id
  const [active, setActive] = useState<SectionId>(fromHash ?? 'profile')

  // A nav click wins over the scroll-spy while its smooth scroll plays out,
  // so a short last section still highlights when it can't reach the line.
  const clickedAt = useRef(0)
  useEffect(() => {
    if (!fromHash) return
    clickedAt.current = Date.now()
    setActive(fromHash)
  }, [fromHash])

  useEffect(() => {
    const main = scroller.current
    if (!main) return
    const onScroll = () => {
      if (Date.now() - clickedAt.current < 800) return
      // The last section whose top has passed a line a third of the way down;
      // at the very bottom the last section wins even if it can't reach that line.
      const line = main.getBoundingClientRect().top + main.clientHeight * 0.35
      let current: SectionId = SECTIONS[0].id
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= line) current = s.id
      }
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 2) current = SECTIONS[SECTIONS.length - 1].id
      setActive(current)
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [scroller])

  return active
}

export default function SettingsPage() {
  useHashScroll()
  const { logOut, user } = useAuth()
  const mainRef = useRef<HTMLElement>(null)
  const active = useActiveSection(mainRef)

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar userName={user?.name} userEmail={user?.email} onLogout={logOut} />
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        <header className="mb-8 border-b border-ink/10 pb-6">
          <h1 className="text-2xl font-black sm:text-3xl uppercase leading-none tracking-tight text-ink" style={{ fontStretch: '125%' }}>Settings</h1>
          <p className="mt-2 text-sm text-muted">Manage your profile, password, preferences and plan.</p>
        </header>
        <div className="flex max-w-5xl gap-12">
          <nav aria-label="Settings sections" className="hidden w-40 flex-shrink-0 lg:block">
            <ul className="sticky top-0 space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link
                    to={{ hash: s.id }}
                    replace
                    aria-current={active === s.id ? 'true' : undefined}
                    className={`block border-l-2 px-3 py-1.5 text-sm font-medium transition-colors ${
                      active === s.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 flex-1">
            <ProfileSection />
            <SecuritySection />
            <PreferencesSection />
            <PlanSection />
          </div>
        </div>
      </main>
    </div>
  )
}
