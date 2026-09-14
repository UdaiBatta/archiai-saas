import { useState } from 'react'
import { SaveStatus, useCanvasStore } from '../../store/canvasStore'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

interface SavePopoverProps {
  designId: string | null
  /** No generated layout exists yet — the honest pre-generation state. */
  hasLayout: boolean
  saving: boolean
  saveError: string | null
  versionName: string
  setVersionName: (value: string) => void
  changeSummary: string
  setChangeSummary: (value: string) => void
  onSave: () => void
}

function statusLabel(status: SaveStatus, lastSavedAt: string | null) {
  if (status === 'saving') return 'Saving…'
  if (status === 'unsaved') return 'Unsaved'
  if (status === 'error') return 'Save error'
  if (!lastSavedAt) return 'Saved'
  return `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

const STATUS_DOT: Record<SaveStatus, string> = {
  saved: 'bg-ok/100',
  saving: 'bg-warn/100',
  unsaved: 'bg-warn',
  error: 'bg-danger/100',
}

export function SavePopover({
  designId,
  hasLayout,
  saving,
  saveError,
  versionName,
  setVersionName,
  changeSummary,
  setChangeSummary,
  onSave,
}: SavePopoverProps) {
  const [open, setOpen] = useState(false)
  useEscapeToClose(open, () => setOpen(false))
  const saveStatus = useCanvasStore((s) => s.saveStatus)
  const lastSavedAt = useCanvasStore((s) => s.lastSavedAt)
  // An empty project reports the store's default 'saved' — misleading before
  // the first generation. Show the honest state until a layout exists.
  const notGenerated = !hasLayout && !lastSavedAt

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={notGenerated ? 'Not generated yet' : statusLabel(saveStatus, lastSavedAt)}
        className="flex items-center gap-2 rounded-lg border border-ink/10 bg-graphite-800/70 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-graphite-800/90"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${notGenerated ? 'border border-muted-light bg-transparent' : STATUS_DOT[saveStatus]}`}
        />
        <span className="max-w-12 truncate sm:max-w-none">{notGenerated ? 'Not generated yet' : statusLabel(saveStatus, lastSavedAt)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-2xl border border-ink/10 bg-graphite-800 p-3 shadow-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-light">Save layout</p>
          <input
            type="text"
            value={versionName}
            onChange={(e) => setVersionName(e.target.value)}
            placeholder="Version name (optional)"
            className="mb-2 h-8 w-full rounded-lg border border-ink/15 bg-graphite-700 px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
          />
          <input
            type="text"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="Change summary (optional)"
            className="mb-3 h-8 w-full rounded-lg border border-ink/15 bg-graphite-700 px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
          />
          <button
            type="button"
            disabled={!designId || saving}
            onClick={() => {
              onSave()
              setOpen(false)
            }}
            className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-graphite-900 hover:bg-graphite-100 disabled:cursor-not-allowed disabled:bg-graphite-500"
          >
            {saving ? 'Saving…' : 'Save Layout'}
          </button>
          {saveError && <p className="mt-2 text-xs text-danger">{saveError}</p>}
        </div>
      )}
    </div>
  )
}
