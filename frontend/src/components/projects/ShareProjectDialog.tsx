import { useState } from 'react'

import { parseSavedViews } from '../canvas/savedViews'
import { useCanvasStore } from '../../store/canvasStore'

import projectService, { ProjectShare } from '../../services/project.service'
import { getApiErrorMessage } from '../../services/apiError'
import { Button } from '../ui/Button'

interface ShareProjectDialogProps {
  projectId: string
  projectTitle: string
  open: boolean
  onClose: () => void
}

export function ShareProjectDialog({
  projectId,
  projectTitle,
  open,
  onClose,
}: ShareProjectDialogProps) {
  const [share, setShare] = useState<ProjectShare | null>(null)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [viewId, setViewId] = useState('')
  const savedViews = useCanvasStore((s) => s.layoutMetadata.savedViews)

  if (!open) return null

  const views = parseSavedViews({ savedViews })
  const publicUrl = share
    ? new URL(share.share_url, window.location.origin).toString() + (viewId ? `#${encodeURIComponent(viewId)}` : '')
    : null

  const createShare = async () => {
    setCreating(true)
    setError(null)
    setMessage(null)
    try {
      setShare(await projectService.createShare(projectId))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create share link'))
    } finally {
      setCreating(false)
    }
  }

  const copyShare = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setMessage('Share link copied.')
    } catch {
      setError('Could not copy the link. Select and copy it manually.')
    }
  }

  const revokeShare = async () => {
    if (!share) return
    setRevoking(true)
    setError(null)
    setMessage(null)
    try {
      await projectService.revokeShare(projectId, share.id)
      setShare(null)
      setMessage('Share link revoked.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to revoke share link'))
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${projectTitle}`}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded border border-ink/10 bg-graphite-800 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Share read-only project</h2>
            <p className="mt-1 text-sm text-muted-light">
              Anyone with the link can view the latest saved layout. They cannot edit it.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close share dialog"
            onClick={onClose}
            className="text-sm text-muted-light hover:text-ink"
          >
            Close
          </button>
        </div>

        {publicUrl ? (
          <div className="space-y-3">
            {views.length > 0 && (
              <label className="flex items-center justify-between gap-3 text-sm text-muted">
                Opens at
                <select
                  value={viewId}
                  onChange={(event) => setViewId(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-ink/15 bg-surface px-2 py-1.5 text-sm text-ink"
                >
                  <option value="">Default view</option>
                  {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
                </select>
              </label>
            )}
            <input
              aria-label="Share link"
              readOnly
              value={publicUrl}
              className="w-full rounded border border-ink/15 bg-surface px-3 py-2 text-sm text-muted"
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={copyShare}>
                Copy link
              </Button>
              <Button variant="secondary" onClick={revokeShare} loading={revoking}>
                Revoke link
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" onClick={createShare} loading={creating}>
            Create share link
          </Button>
        )}

        {message && <p className="mt-3 text-sm text-ok">{message}</p>}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </div>
  )
}
