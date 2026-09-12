import { Avatar } from '../ui/Avatar'
import { LevelMenu } from './LevelMenu'
import { OverflowMenu } from './OverflowMenu'
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

  onHistory: () => void
  onActivity: () => void
  onExportImage: () => void
  onExportPdf: () => void
  onDuplicate: () => void
  onEditProject: () => void
  onDelete: () => void
  exportingImage: boolean
  exportingPdf: boolean
  duplicating: boolean
  deleting: boolean
  roomCount: number
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
  onHistory,
  onActivity,
  onExportImage,
  onExportPdf,
  onDuplicate,
  onEditProject,
  onDelete,
  exportingImage,
  exportingPdf,
  duplicating,
  deleting,
  roomCount,
  exportError,
  duplicateError,
  deleteError,
}: EditorTopBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-ink/10 bg-[#191a1b]/92 px-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2.5 pointer-events-auto">
        <button
          type="button"
          onClick={onBackToDashboard}
          className="flex items-baseline gap-px text-ink"
          title="Back to projects"
        >
          <span className="text-sm font-extrabold tracking-wide">ARCHI</span>
          <span className="text-sm font-extrabold tracking-wide text-ink">·AI</span>
        </button>
        <span className="h-3.5 w-px bg-ink/15" />

        {editing ? (
          <div className="flex flex-col gap-1 rounded-xl border border-ink/10 bg-graphite-800/95 p-2 shadow-[0_8px_28px_rgba(0,0,0,0.16)] backdrop-blur">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="rounded-lg border border-ink/15 bg-graphite-700 px-2 py-1 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              placeholder="Description (optional)"
              className="w-56 resize-none rounded-lg border border-ink/15 bg-graphite-700 px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
            {saveError && <p className="text-xs text-danger">{saveError}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={savingTitle}
                className="flex-1 rounded-lg border border-ink/15 px-2 py-1 text-xs font-medium text-ink/70 hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveTitle}
                disabled={savingTitle || !editTitle.trim()}
                className="flex-1 rounded-lg bg-ink px-2 py-1 text-xs font-medium text-graphite-900 hover:bg-graphite-100 disabled:bg-graphite-500"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEnterEdit}
            className="flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <span className="max-w-[16rem] truncate">{projectTitle}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
        <span className="h-3.5 w-px bg-ink/15" />

        <LevelMenu />
      </div>

      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
        <OverflowMenu
          onHistory={onHistory}
          onActivity={onActivity}
          onExportImage={onExportImage}
          onExportPdf={onExportPdf}
          onDuplicate={onDuplicate}
          onEdit={onEditProject}
          onDelete={onDelete}
          exportingImage={exportingImage}
          exportingPdf={exportingPdf}
          duplicating={duplicating}
          deleting={deleting}
          roomCount={roomCount}
          exportError={exportError}
          duplicateError={duplicateError}
          deleteError={deleteError}
        />

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

        <Avatar name={avatarName} size={7.5} />
      </div>
    </div>
  )
}
