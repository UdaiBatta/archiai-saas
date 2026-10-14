import { useState } from 'react'

import { fetchServerRooms, saveAsNewVersion } from '../../services/saveConflict'
import { diffLayouts, isSameLayout, type LayoutDiff } from '../../store/layoutDiff'
import { useCanvasStore } from '../../store/canvasStore'

const button =
  'rounded-md border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent/60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent disabled:opacity-50'

const list = (names: string[]) => names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '')

interface SaveConflictBannerProps {
  projectId: string
  /** Reloading discards this tab's edits, so it asks first. Injectable for tests. */
  onReload?: () => void
}

/**
 * Shown when a save was refused because the design was changed somewhere else
 * (another tab, or a collaborator). The edits on screen are kept and nothing
 * more is autosaved over the newer copy until the user chooses:
 *
 *   Compare              what differs between this tab and the saved copy
 *   Save as new version  this tab's copy, on top of the saved one (which stays in the history)
 *   Reload               take the saved copy and drop this tab's edits
 */
export function SaveConflictBanner({ projectId, onReload = () => window.location.reload() }: SaveConflictBannerProps) {
  const conflict = useCanvasStore((s) => s.saveConflict)
  const [diff, setDiff] = useState<LayoutDiff | null>(null)
  const [busy, setBusy] = useState<'compare' | 'save' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!conflict) return null

  const compare = async () => {
    setBusy('compare')
    setMessage(null)
    try {
      setDiff(diffLayouts(useCanvasStore.getState().rooms, await fetchServerRooms(projectId)))
    } catch {
      setMessage('Could not load the saved copy to compare.')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setMessage(null)
    const result = await saveAsNewVersion()
    setBusy(null)
    if (!result.ok) setMessage(result.message)
    else setDiff(null)
  }

  const reload = () => {
    if (window.confirm('Reload the saved copy? The edits in this tab that were not saved will be lost.')) onReload()
  }

  return (
    <section
      role="alert"
      aria-label="Save conflict"
      className="absolute left-1/2 top-16 z-40 flex w-[min(40rem,92%)] -translate-x-1/2 flex-col gap-2 rounded-xl border border-warn/40 bg-graphite-800/95 p-3 text-[11px] text-muted shadow-lg backdrop-blur"
    >
      <div>
        <p className="text-xs font-semibold text-ink">Not saved: this plan was changed somewhere else</p>
        <p className="mt-0.5">
          Another tab or a collaborator saved a newer copy. Your edits stay on this screen but are not being saved.
        </p>
      </div>

      {diff && (
        <div aria-label="Differences" className="rounded-md bg-graphite-900/60 p-2 text-muted-light">
          {isSameLayout(diff) ? (
            <p>The rooms are the same in both copies.</p>
          ) : (
            <ul className="flex list-disc flex-col gap-0.5 pl-4">
              {diff.onlyHere.length > 0 && <li>Only in your copy: {list(diff.onlyHere)}</li>}
              {diff.onlyThere.length > 0 && <li>Only in the saved copy: {list(diff.onlyThere)}</li>}
              {diff.changed.slice(0, 6).map((item) => (
                <li key={item.label}>
                  {item.label}: {item.what.join(', ')}
                </li>
              ))}
              {diff.changed.length > 6 && <li>and {diff.changed.length - 6} more rooms differ</li>}
            </ul>
          )}
        </div>
      )}

      {message && <p className="text-warn">{message}</p>}

      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={button} disabled={busy !== null} onClick={compare}>
          {busy === 'compare' ? 'Comparing…' : 'Compare'}
        </button>
        <button type="button" className={button} disabled={busy !== null} onClick={save}>
          {busy === 'save' ? 'Saving…' : 'Save as new version'}
        </button>
        <button type="button" className={button} disabled={busy !== null} onClick={reload}>
          Reload
        </button>
      </div>
    </section>
  )
}
