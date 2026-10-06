import { describe, expect, it } from 'vitest'
import { persistenceStatus } from './saveState'

const base = { saveStatus: 'saved' as const, draftStatus: 'idle' as const, lastSavedAt: null, lastDraftSavedAt: null }

describe('persistenceStatus', () => {
  it('reports autosaved work as safe even without a named save', () => {
    expect(persistenceStatus({ ...base, saveStatus: 'unsaved', draftStatus: 'saved' })).toMatchObject({ tone: 'ok', label: 'Auto-saved' })
  })
  it('is pending while the autosave has not run yet, busy while it runs', () => {
    expect(persistenceStatus({ ...base, saveStatus: 'unsaved', draftStatus: 'dirty' }).tone).toBe('pending')
    expect(persistenceStatus({ ...base, saveStatus: 'unsaved', draftStatus: 'saving' }).label).toBe('Saving…')
  })
  it('surfaces a failed autosave', () => {
    expect(persistenceStatus({ ...base, saveStatus: 'unsaved', draftStatus: 'error' }).tone).toBe('error')
  })
  it('shows a named save', () => {
    expect(persistenceStatus(base)).toMatchObject({ tone: 'ok', label: 'Saved' })
  })
})
