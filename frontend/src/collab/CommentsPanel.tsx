import { DOCK_CARD } from '../components/canvas/EditorDock'
import { useCanvasStore } from '../store/canvasStore'
import { threadsOf, useComments } from './commentsStore'

/** The Comments dock popover: pin a new comment, and every thread in the project. */
export function CommentsPanel() {
  const comments = useComments((s) => s.comments)
  const placing = useComments((s) => s.placing)
  const openId = useComments((s) => s.openId)
  const showResolved = useComments((s) => s.showResolved)
  const error = useComments((s) => s.error)
  const { setPlacing, open, setShowResolved } = useComments.getState()
  const rooms = useCanvasStore((s) => s.rooms)
  const threads = threadsOf(comments)
  const resolvedCount = threads.filter((t) => t.root.resolved).length
  const shown = threads.map((t, i) => ({ ...t, n: i + 1 })).filter((t) => showResolved || !t.root.resolved)

  return (
    <div role="group" aria-label="Comments" className={`${DOCK_CARD} w-72`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">Comments</span>
        <button
          type="button"
          aria-pressed={placing}
          onClick={() => setPlacing(!placing)}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${placing ? 'bg-accent text-graphite-950' : 'bg-ink/5 text-ink hover:bg-ink/10'}`}
        >
          {placing ? 'Click the model…' : '+ Pin a comment'}
        </button>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {shown.length === 0 ? (
        <p className="text-muted-light">{threads.length ? 'All comments are resolved.' : 'No comments yet. Pin one to a room or a spot in the model.'}</p>
      ) : (
        <ul className="-mx-1 max-h-64 overflow-y-auto">
          {shown.map(({ root, replies, n }) => (
            <li key={root.id}>
              <button
                type="button"
                onClick={() => open(openId === root.id ? null : root.id)}
                className={`flex w-full gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-ink/5 ${openId === root.id ? 'bg-ink/5' : ''}`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${root.resolved ? 'bg-graphite-400 text-white' : 'bg-accent text-graphite-950'}`}>{n}</span>
                <span className="min-w-0">
                  <span className="block truncate text-ink">{root.body}</span>
                  <span className="text-[10px] text-muted-light">
                    {root.author_name}
                    {root.room_id && ` · ${rooms.find((r) => r.id === root.room_id)?.label ?? 'removed room'}`}
                    {replies.length > 0 && ` · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {resolvedCount > 0 && (
        <label className="flex items-center gap-2 border-t border-ink/10 pt-2">
          <input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} className="accent-accent" />
          Show resolved ({resolvedCount})
        </label>
      )}
    </div>
  )
}
