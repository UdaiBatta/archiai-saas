import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Sidebar } from '@/components/layout/Sidebar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { useHashScroll } from '@/hooks/useHashScroll'
import api from '@/services/api'
import { getApiErrorMessage } from '@/services/apiError'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/authStore'
import { loadPreferences, savePreferences, type Preferences } from '@/utils/preferences'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 rounded-2xl border border-ink/10 bg-graphite-900 p-5 sm:p-6">
      <h2 id={`${id}-title`} className="mb-4 text-base font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Status({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>
  if (ok) return <p role="status" className="text-sm text-ok">{ok}</p>
  return null
}

function ProfileSection() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setOk(null)
    if (!name.trim()) return setError('Name is required')
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
    <Section id="profile" title="Profile">
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
        <Input label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <Input label="Email" value={user?.email ?? ''} readOnly disabled />
        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} disabled={name.trim() === user?.name}>Save name</Button>
          <Status error={error} ok={ok} />
        </div>
      </form>
    </Section>
  )
}

function PasswordSection() {
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

  return (
    <Section id="password" title="Password">
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
        <Input label="Current password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        <Input label="New password" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" loading={saving}>Change password</Button>
          <Status error={error} ok={ok} />
        </div>
      </form>
    </Section>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#FF3B1F]" />
    </label>
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
    <Section id="preferences" title="Preferences">
      <div className="max-w-md divide-y divide-ink/10">
        <Toggle label="Snap to grid" hint="Grid snapping is on when you open a project." checked={prefs.snapToGrid} onChange={(v) => update({ snapToGrid: v })} />
        <Toggle label="Reduce motion" hint="Turn off interface animations and transitions." checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
      </div>
      <p className="mt-3 text-xs text-muted-light">Saved in this browser.</p>
    </Section>
  )
}

function PlanSection() {
  const [plan, setPlan] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ plan_code: string }>('/api/billing/subscription')
      .then((r) => setPlan(r.data.plan_code))
      .catch(() => setPlan('free'))
  }, [])

  return (
    <Section id="plan" title="Plan">
      <p className="text-sm text-muted">
        You’re on the <span className="font-semibold capitalize text-ink">{plan ?? '…'}</span> plan. Paid plans are coming soon.
      </p>
      <Link to="/pricing" className="mt-4 inline-block text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
        See plans and pricing
      </Link>
    </Section>
  )
}

export default function SettingsPage() {
  useHashScroll()
  const { logOut, user } = useAuth()

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar userName={user?.name} userEmail={user?.email} onLogout={logOut} />
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
        <h1 className="mb-6 text-3xl font-black uppercase leading-none tracking-tight text-ink" style={{ fontStretch: '125%' }}>Settings</h1>
        <div className="flex max-w-3xl flex-col gap-4">
          <ProfileSection />
          <PasswordSection />
          <PreferencesSection />
          <PlanSection />
        </div>
      </main>
    </div>
  )
}
