import { useCanvasStore, type Room } from '../store/canvasStore'
import {
  fetchDesignDraft,
  getLatestProjectDesign,
  revisionConflictOf,
  saveDesignDraft,
  saveDesignLayout,
} from './design.service'

/**
 * What to do with a save the server refused because the design changed
 * elsewhere (another tab, or a collaborator). Local edits are never touched
 * here; each action either reads the server's copy or writes this tab's copy
 * on top of the current revision.
 */

/** The rooms of the copy on the server: the newest autosave if there is one, else the last save. */
export async function fetchServerRooms(projectId: string): Promise<Room[]> {
  const latest = await getLatestProjectDesign(projectId)
  const draft = latest.designId ? await fetchDesignDraft(latest.designId) : null
  return (draft ?? latest).rooms as Room[]
}

export type SaveAsNewVersionResult = { ok: true } | { ok: false; message: string }

/**
 * Save this tab's copy as a new named version on top of the server's current
 * revision. The other copy stays in the version history; nothing is lost.
 * The autosave draft is brought in step so a reload opens this version.
 */
export async function saveAsNewVersion(): Promise<SaveAsNewVersionResult> {
  const store = useCanvasStore.getState()
  const { designId, saveConflict } = store
  if (!designId) return { ok: false, message: 'There is no design to save.' }
  const layout = store.serializeLayout()
  try {
    const saved = await saveDesignLayout(designId, layout, {
      versionName: 'Saved over a newer copy',
      changeSummary: 'Saved from a tab that was out of date; the newer copy is in the history.',
      baseRevision: saveConflict?.currentRevision ?? store.designRevision,
    })
    const draft = await saveDesignDraft(designId, layout, { baseRevision: saved.revision })
    // Keep the local edits as they are: only the bookkeeping moves on.
    useCanvasStore.setState({ saveStatus: 'saved', lastSavedAt: new Date().toISOString(), designVersionId: saved.designVersionId ?? null })
    useCanvasStore.getState().markDraftSaved(draft.updatedAt ?? draft.createdAt, draft.id, draft.revision)
    useCanvasStore.getState().clearSaveConflict()
    return { ok: true }
  } catch (error) {
    const again = revisionConflictOf(error)
    if (again) {
      useCanvasStore.getState().markSaveConflict(again)
      return { ok: false, message: 'It changed again while saving. Compare, then try once more.' }
    }
    return { ok: false, message: 'Could not save. Check your connection and try again.' }
  }
}
