import type { DraftStatus, SaveStatus } from './canvasStore'

export type SaveTone = 'ok' | 'busy' | 'pending' | 'error'

const time = (iso: string | null) => {
  const date = iso ? new Date(iso) : null
  return date && !Number.isNaN(date.getTime()) ? ` ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''
}

/**
 * One honest persistence status from the named save and the autosave draft.
 * Work is safe once the autosave has it, even without a named save.
 */
export function persistenceStatus(state: {
  saveStatus: SaveStatus
  draftStatus: DraftStatus
  lastSavedAt: string | null
  lastDraftSavedAt: string | null
}): { tone: SaveTone; label: string } {
  if (state.saveStatus === 'saving' || state.draftStatus === 'saving') return { tone: 'busy', label: 'Saving…' }
  if (state.saveStatus === 'error' || state.draftStatus === 'error') return { tone: 'error', label: 'Save failed' }
  if (state.draftStatus === 'dirty') return { tone: 'pending', label: 'Unsaved' }
  if (state.saveStatus === 'unsaved' && state.draftStatus === 'saved') {
    return { tone: 'ok', label: `Auto-saved${time(state.lastDraftSavedAt)}` }
  }
  if (state.saveStatus === 'unsaved') return { tone: 'pending', label: 'Unsaved' }
  return { tone: 'ok', label: `Saved${time(state.lastSavedAt)}` }
}
