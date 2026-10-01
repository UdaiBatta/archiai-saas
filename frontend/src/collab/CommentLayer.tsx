import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useAuthStore } from '../store/authStore'
import { useCanvasStore } from '../store/canvasStore'
import { roomWorldBounds } from '../components/canvas/topViewModel'
import { threadsOf, useComments, type Comment } from './commentsStore'

const stop = (event: SyntheticEvent) => event.stopPropagation()
// Keep clicks on pins and cards out of the 3D view (no deselect, no pick-through).
const keepOut = { onPointerDown: stop, onPointerUp: stop, onClick: stop, onWheel: stop }

/** The room whose floor area holds the point, on the storey at its height. */
export function roomAt(x: number, y: number, z: number): string | null {
  const room = useCanvasStore.getState().rooms.find((r) => {
    if (r.objectType !== 'room') return false
    const b = roomWorldBounds(r)
    const floor = r.position.y - r.size.h / 2
    return x >= b.x && x <= b.x + b.w && z >= b.z && z <= b.z + b.d && y >= floor - 0.1 && y <= floor + r.size.h + 0.1
  })
  return room?.id ?? null
}

const labelOf = (roomId: string | null) =>
  (roomId && useCanvasStore.getState().rooms.find((r) => r.id === roomId)?.label) || 'Comment'

/** Pin mode: the next primary click on the model drops a draft comment there. */
function usePinClick() {
  const placing = useComments((s) => s.placing)
  const { gl, camera, scene, raycaster } = useThree()
  useEffect(() => {
    if (!placing) return
    const canvas = gl.domElement
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      // Capture phase on the canvas runs before R3F's handler on its parent.
      event.stopPropagation()
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((h) => (h.object as THREE.Mesh).isMesh && h.object.visible)
      const point = hit?.point ?? raycaster.ray.intersectPlane(ground, new THREE.Vector3())
      if (!point) return
      useComments.getState().setDraft({ x: point.x, y: point.y, z: point.z, roomId: roomAt(point.x, point.y, point.z) })
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useComments.getState().setPlacing(false)
    }
    canvas.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    const cursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      canvas.style.cursor = cursor
    }
  }, [placing, gl, camera, scene, raycaster])
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div {...keepOut} className="w-64 rounded-xl border border-ink/10 bg-graphite-800/95 p-3 text-xs text-ink shadow-[0_8px_28px_rgba(0,0,0,0.25)] backdrop-blur">
      {children}
    </div>
  )
}

function Composer({ placeholder, onSend, onCancel }: { placeholder: string; onSend: (body: string) => Promise<void>; onCancel?: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    await onSend(body.trim())
    setBusy(false)
    setBody('')
  }
  return (
    <div className="mt-2">
      <textarea
        autoFocus
        rows={2}
        value={body}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Editor shortcuts (Delete, R, Ctrl+Z) must not fire while typing.
          event.stopPropagation()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void send()
          }
          if (event.key === 'Escape') onCancel?.()
        }}
        className="w-full resize-none rounded-lg border border-ink/10 bg-graphite-900/70 px-2 py-1.5 text-xs text-ink outline-none placeholder:text-muted-light focus:border-accent"
      />
      <div className="mt-1.5 flex justify-end gap-1.5">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-muted hover:text-ink">Cancel</button>}
        <button type="button" disabled={!body.trim() || busy} onClick={() => void send()} className="rounded-md bg-accent px-2.5 py-1 font-semibold text-graphite-950 disabled:opacity-40">
          Post
        </button>
      </div>
    </div>
  )
}

function Message({ comment, canDelete }: { comment: Comment; canDelete: boolean }) {
  const remove = useComments((s) => s.remove)
  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{comment.author_name}</span>
        <span className="flex items-center gap-2 text-[10px] text-muted-light">
          {canDelete && (
            <button type="button" onClick={() => void remove(comment.id)} className="hidden text-muted hover:text-danger group-hover:inline">Delete</button>
          )}
          {new Date(comment.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-muted">{comment.body}</p>
    </div>
  )
}

function Pin({ n, point, active, resolved, onClick, children }: { n: number | '+'; point: { x: number; y: number; z: number }; active: boolean; resolved?: boolean; onClick?: () => void; children?: ReactNode }) {
  return (
    <Html position={[point.x, point.y + 0.05, point.z]} zIndexRange={[40, 30]}>
      <div {...keepOut} className="relative -translate-y-full">
        <button
          type="button"
          onClick={onClick}
          aria-label={typeof n === 'number' ? `Comment ${n}` : 'New comment'}
          className={`flex h-7 w-7 items-center justify-center rounded-full rounded-bl-none border-2 border-white text-[11px] font-bold shadow-md transition-transform hover:scale-110 ${
            resolved ? 'bg-graphite-400 text-white' : active ? 'bg-ink text-graphite-950' : 'bg-accent text-graphite-950'
          }`}
        >
          {n}
        </button>
        {children && <div className="absolute left-9 top-0">{children}</div>}
      </div>
    </Html>
  )
}

/** Comment pins in the model, the open thread and the new-comment composer. */
export function CommentLayer() {
  usePinClick()
  const comments = useComments((s) => s.comments)
  const draft = useComments((s) => s.draft)
  const openId = useComments((s) => s.openId)
  const showResolved = useComments((s) => s.showResolved)
  const { open, setDraft, post, resolve } = useComments.getState()
  const me = useAuthStore((s) => s.user?.id)

  return (
    <group>
      {threadsOf(comments).map(({ root, replies }, index) => {
        if (root.resolved && !showResolved && openId !== root.id) return null
        const isOpen = openId === root.id
        return (
          <Pin key={root.id} n={index + 1} point={root} active={isOpen} resolved={root.resolved} onClick={() => open(isOpen ? null : root.id)}>
            {isOpen && (
              <Card>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-light">{labelOf(root.room_id)}</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => void resolve(root.id, !root.resolved)} className="text-[11px] font-medium text-muted hover:text-ok">
                      {root.resolved ? 'Reopen' : 'Resolve'}
                    </button>
                    <button type="button" aria-label="Close comment" onClick={() => open(null)} className="text-muted hover:text-ink">✕</button>
                  </span>
                </div>
                <div className="max-h-56 space-y-2.5 overflow-y-auto">
                  {[root, ...replies].map((c) => <Message key={c.id} comment={c} canDelete={c.author_id === me} />)}
                </div>
                <Composer placeholder="Reply…" onSend={(body) => post(body, { parentId: root.id })} />
              </Card>
            )}
          </Pin>
        )
      })}
      {draft && (
        <Pin n="+" point={draft} active>
          <Card>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-light">{draft.roomId ? labelOf(draft.roomId) : 'New comment'}</span>
            <Composer placeholder="Add a comment…" onSend={(body) => post(body, draft)} onCancel={() => setDraft(null)} />
          </Card>
        </Pin>
      )}
    </group>
  )
}
