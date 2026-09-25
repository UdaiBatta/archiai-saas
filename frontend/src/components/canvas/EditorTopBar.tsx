import { Avatar } from '../ui/Avatar'
import { LevelMenu } from './LevelMenu'
import { EditorMenubar, type EditorMenubarProps } from './EditorMenubar'
import { SavePopover } from './SavePopover'

interface EditorTopBarProps {
  projectTitle: string
  onBackToDashboard: () => void

  editing: boolean
  editTitle: string
  setEditTitle: (value: string) => void
  editDescription: string
  setEditDescription: (value: string) => void
  saveError: string | null
  savingTitle: boolean
  onEnterEdit: () => void
  onCancelEdit: () => void
  onSaveTitle: () => void

  onShare: () => void
  avatarName: string

  designId: string | null
  hasLayout: boolean
  layoutSaving: boolean
  layoutSaveError: string | null
  versionName: string
  setVersionName: (value: string) => void
  changeSummary: string
  setChangeSummary: (value: string) => void
  onSaveLayout: () => void

  menubar: EditorMenubarProps
  exportError: string | null
  duplicateError: string | null
  deleteError: string | null
}

export function EditorTopBar({
  projectTitle,
  onBackToDashboard,
  editing,
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
  saveError,
  savingTitle,
  onEnterEdit,
  onCancelEdit,
  onSaveTitle,
  onShare,
  avatarName,
  designId,
  hasLayout = true,
  layoutSaving,
  layoutSaveError,
  versionName,
  setVersionName,
  changeSummary,
  setChangeSummary,
  onSaveLayout,
  menubar,
  exportError,
  duplicateError,
  deleteError,
}: EditorTopBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-12 items-center justify-between gap-1 border-b border-ink/10 bg-[#191a1b]/92 px-2 backdrop-blur-md sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1 sm:gap-2.5">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="flex items-baseline gap-px text-ink"
          title="Back to projects"
          aria-label="Back to projects"
        >
          <span className="text-sm font-extrabold sm:hidden">A·</span>
          <span className="hidden text-sm font-extrabold tracking-wide sm:inline">ARCHI</span>
          <span className="hidden text-sm font-extrabold tracking-wide text-ink sm:inline">·AI</span>
        </button>
        <span className="hidden h-3.5 w-px bg-ink/15 sm:block" />
        <EditorMenubar {...menubar} />
        <span className="hidden h-3.5 w-px bg-ink/15 sm:block" />

        {/* The title, with its rename form dropping down below it (it used
            to replace the title inside the 48 px bar and got cut off). */}
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={editing ? onCancelEdit : onEnterEdit}
            aria-expanded={editing}
            className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted hover:text-ink"
          >
            <span className="max-w-[4rem] truncate sm:max-w-[16rem]">{projectTitle}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {editing && (
            <form
              aria-label="Project details"
              className="absolute left-0 top-full z-50 mt-3 flex w-72 flex-col gap-2.5 rounded-xl border border-ink/10 bg-graphite-800 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
              onSubmit={(event) => {
                event.preventDefault()
                if (editTitle.trim() && !savingTitle) onSaveTitle()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onCancelEdit()
              }}
            >
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                Project name
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  className="rounded-lg border border-ink/15 bg-graphite-700 px-2.5 py-1.5 text-sm font-semibold text-ink focus:border-accent/60 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                Description
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional"
                  className="resize-none rounded-lg border border-ink/15 bg-graphite-700 px-2.5 py-1.5 text-xs text-ink placeholder:text-muted-light focus:border-accent/60 focus:outline-none"
                />
              </label>
              {saveError && <p role="alert" className="text-xs text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  disabled={savingTitle}
                  className="flex-1 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink/80 hover:bg-ink/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTitle || !editTitle.trim()}
                  className="flex-1 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-graphite-950 disabled:opacity-50"
                >
                  {savingTitle ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
        <span className="hidden h-3.5 w-px bg-ink/15 sm:block" />

        {hasLayout && <LevelMenu />}
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center justify-end gap-1 sm:gap-2">
        <button
          type="button"
          aria-label="Share project"
          onClick={onShare}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 bg-graphite-800/90 text-ink/70 hover:bg-graphite-750"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>

        <SavePopover
          designId={designId}
          hasLayout={hasLayout}
          saving={layoutSaving}
          saveError={layoutSaveError}
          versionName={versionName}
          setVersionName={setVersionName}
          changeSummary={changeSummary}
          setChangeSummary={setChangeSummary}
          onSave={onSaveLayout}
        />

        <span className="hidden md:block"><Avatar name={avatarName} size={7.5} /></span>
      </div>

      {/* Menu actions close their menu, so their failures show here. */}
      {(exportError || duplicateError || deleteError) && (
        <p role="alert" className="pointer-events-auto absolute inset-x-0 top-full border-b border-danger/30 bg-danger/10 px-4 py-1.5 text-xs text-danger">
          {exportError ?? duplicateError ?? deleteError}
        </p>
      )}
    </div>
  )
}
