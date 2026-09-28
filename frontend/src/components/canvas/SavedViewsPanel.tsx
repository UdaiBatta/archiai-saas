import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { useCanvasStore } from '../../store/canvasStore'
import type { CameraPreset } from './modelView'
import { MAX_VIEW_NAME, addView, deleteView, parseSavedViews, renameView, type SavedView } from './savedViews'

type Vec3 = [number, number, number]
export interface CameraPose {
  position: Vec3
  target: Vec3
  zoom: number
}
export interface ViewCameraApi {
  capture: () => CameraPose
  /** Move the camera once Scene shows the view's preset and `floor`. */
  restore: (view: SavedView, floor: number | 'all') => void
}
interface Controls {
  target: THREE.Vector3
  update: () => void
}

/** Lives inside <Canvas>, after <Scene>: reads and sets the live camera. */
export function ViewCamera({ apiRef, preset }: { apiRef: Ref<ViewCameraApi>; preset: CameraPreset }) {
  const get = useThree((s) => s.get)
  const camera = useThree((s) => s.camera)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const [pending, setPending] = useState<{ view: SavedView; floor: number | 'all' } | null>(null)
  useImperativeHandle(apiRef, () => ({
    capture: () => {
      const { camera, controls } = get()
      const target = (controls as unknown as Controls | null)?.target
      return {
        position: camera.position.toArray() as Vec3,
        target: (target?.toArray() ?? [0, 0, 0]) as Vec3,
        zoom: camera.zoom,
      }
    },
    restore: (view, floor) => setPending({ view, floor }),
  }), [get])

  // Restoring can switch preset and floor, which makes Scene re-frame (and
  // swap persp/ortho cameras), possibly over several commits. Wait until
  // Scene has all three; this effect then runs after Scene's framing effect
  // in the same commit, so the saved pose lands on top.
  useEffect(() => {
    if (!pending) return
    const { view, floor } = pending
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true
    if (preset !== view.preset || selectedFloor !== floor || ortho !== (view.preset !== 'perspective')) return
    camera.position.set(...view.position)
    camera.zoom = view.zoom
    camera.updateProjectionMatrix()
    const orbit = get().controls as unknown as Controls | null
    orbit?.target.set(...view.target)
    orbit?.update()
    camera.lookAt(...view.target)
    get().invalidate()
    setPending(null)
  }, [pending, camera, preset, selectedFloor, get])
  return null
}

const newId = () => `view_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const iconButton = 'rounded px-1.5 py-0.5 text-muted hover:bg-ink/10 hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent'

interface SavedViewsPanelProps {
  readOnly?: boolean
  /** The full current view (camera + preset, sun, floor, ghost). */
  capture: () => Omit<SavedView, 'id' | 'name'>
  onRestore: (view: SavedView) => void
}

export function SavedViewsPanel({ readOnly = false, capture, onRestore }: SavedViewsPanelProps) {
  const raw = useCanvasStore((s) => s.layoutMetadata.savedViews)
  const setSavedViews = useCanvasStore((s) => s.setSavedViews)
  const views = parseSavedViews({ savedViews: raw })
  const [editing, setEditingState] = useState<string | null>(null)
  // Enter/Escape unmount the field, which can also fire blur: act once.
  const editingRef = useRef<string | null>(null)
  const setEditing = (id: string | null) => {
    editingRef.current = id
    setEditingState(id)
  }
  if (readOnly && views.length === 0) return null

  const commitRename = (id: string, name: string) => {
    if (editingRef.current !== id) return
    setSavedViews(renameView(views, id, name))
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-ink/10 bg-graphite-800/95 px-3 py-2.5 text-[11px] text-muted shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">Views</span>
        {!readOnly && (
          <button
            type="button"
            aria-label="Save current view"
            onClick={() => setSavedViews(addView(views, capture(), newId()))}
            className="rounded-md px-2 py-0.5 font-semibold text-accent hover:bg-ink/10"
          >
            + Save
          </button>
        )}
      </div>
      {views.length === 0 ? (
        <span className="text-muted-light">Save a camera angle to come back to it.</span>
      ) : (
        <ul aria-label="Saved views" className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
          {views.map((view) => (
            <li key={view.id} className="flex items-center gap-0.5">
              {editing === view.id ? (
                <input
                  autoFocus
                  aria-label={`Rename view ${view.name}`}
                  defaultValue={view.name}
                  maxLength={MAX_VIEW_NAME}
                  onFocus={(event) => event.target.select()}
                  onBlur={(event) => commitRename(view.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename(view.id, event.currentTarget.value)
                    if (event.key === 'Escape') setEditing(null)
                  }}
                  className="min-w-0 flex-1 rounded-md border border-ink/20 bg-graphite-900/60 px-2 py-1 text-ink outline-none focus:border-accent"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Go to view ${view.name}`}
                  title={view.name}
                  onClick={() => onRestore(view)}
                  onDoubleClick={readOnly ? undefined : () => setEditing(view.id)}
                  className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-ink hover:bg-ink/10"
                >
                  {view.name}
                </button>
              )}
              {!readOnly && editing !== view.id && (
                <>
                  <button type="button" aria-label={`Rename view ${view.name}`} title="Rename" onClick={() => setEditing(view.id)} className={iconButton}>
                    ✎
                  </button>
                  <button type="button" aria-label={`Delete view ${view.name}`} title="Delete" onClick={() => setSavedViews(deleteView(views, view.id))} className={iconButton}>
                    ×
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
