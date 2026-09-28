import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Scene } from './Scene'
import { RoomMesh as RoomMeshBase } from './RoomMesh'
import { TopPlanOverlay } from './TopPlanOverlay'
import { TopPlanKeyboardLayer } from './TopPlanKeyboardLayer'
import { PauseWhileMoving, PerfReadout, SHOW_PERF } from './RenderBudget'
import { useCanvasStore } from '../../store/canvasStore'
import { canClearSelectionFromEmptyCanvas } from '../../store/interactionModel'
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts'
import { shouldRenderCanvasObject } from './canvasObjectVisibility'
import { EDITOR_PALETTE } from './editorPalette'
import { hardViolationRoomIds, parseMvpQuality } from './qualityModel'
import { SUNRISE, SUNSET, formatHour, sunAt } from './sunModel'
import { MODEL_COLORS, floorDisplay, type CameraPreset } from './modelView'
import { DOCK_CARD, EditorDock } from './EditorDock'
import { SavedViewsPanel, ViewCamera, type ViewCameraApi } from './SavedViewsPanel'
import { parseSavedViews, restorableFloor, type SavedView } from './savedViews'
import { MassLayer } from '../../site/MassLayer'
import { MassingPanel } from '../../site/MassingPanel'
import { SiteLayer } from '../../site/SiteLayer'
import { SitePanel } from '../../site/SitePanel'

// Props are stable per room, so metadata or UI-state changes in this
// component no longer re-render every room.
const RoomMesh = memo(RoomMeshBase)

const segmentClass = (active: boolean) =>
  `flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
    active ? 'bg-accent text-graphite-950' : 'text-muted hover:bg-ink/10 hover:text-ink'
  }`

interface Canvas3DProps {
  className?: string
  readOnly?: boolean
  modelStage?: boolean
  briefBackground?: boolean
  /** Camera to open the 3D view with (e.g. Axo chosen from a lens). */
  initialPreset?: Exclude<CameraPreset, 'top'>
}

export function Canvas3D({ className, readOnly = false, modelStage = false, briefBackground = false, initialPreset = 'perspective' }: Canvas3DProps) {
  const orbitRef = useRef<{ enabled: boolean }>(null)
  const rooms = useCanvasStore((s) => s.rooms)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const storedViewMode = useCanvasStore((s) => s.viewMode)
  const setViewMode = useCanvasStore((s) => s.setViewMode)
  // The plan tab *is* the 3D Top view: floor_plan in the store <=> Top here.
  const planLens = !briefBackground && storedViewMode === 'floor_plan'
  const viewMode = briefBackground || planLens ? '3d' : storedViewMode
  const mvpQuality = useCanvasStore((s) => s.layoutMetadata.mvpQuality)
  const mvpFootprint = useCanvasStore((s) => s.layoutMetadata.mvpFootprint)
  const clipboardMessage = useCanvasStore((s) => s.clipboardMessage)
  const clearClipboardMessage = useCanvasStore((s) => s.clearClipboardMessage)
  // 10:00 by default: morning light, so an east-facing front reads as lit.
  const [sunHour, setSunHour] = useState(10)
  const [orbitPreset, setOrbitPreset] = useState<CameraPreset>(initialPreset)
  const preset: CameraPreset = planLens ? 'top' : orbitPreset
  const [frameNonce, setFrameNonce] = useState(0)
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null)
  const floors = useCanvasStore((s) => s.floors)
  const floorHeight = useCanvasStore((s) => s.floorHeight)
  const [ghostFloors, setGhostFloors] = useState(false)
  const multiFloor = useCanvasStore((s) => s.floors.length > 1)
  const hasSavedViews = useCanvasStore((s) => parseSavedViews({ savedViews: s.layoutMetadata.savedViews }).length > 0)
  const viewCameraRef = useRef<ViewCameraApi>(null)
  const aoRef = useRef<{ enabled: boolean }>(null)
  const restoreView = (view: SavedView) => {
    const state = useCanvasStore.getState()
    applyPreset(view.preset)
    setSunHour(view.sunHour)
    setGhostFloors(view.ghostFloors)
    const floor = restorableFloor(view, state.floors.map((level) => level.level))
    state.setSelectedFloor(floor)
    viewCameraRef.current?.restore(view, floor)
  }
  // Architectural site presentation for the real 3D view (not the hidden
  // capture canvas behind the plan lenses, nor the empty-brief backdrop).
  const studio = viewMode === '3d' && !briefBackground
  const topView = studio && preset === 'top'
  // Top shows one level; "all" means the lowest, as the 2D plan did.
  const sortedFloors = [...floors].sort((a, b) => a.level - b.level)
  const planLevel = topView && selectedFloor === 'all' ? sortedFloors[0]?.level ?? 0 : selectedFloor
  const planFloor = sortedFloors.find((floor) => floor.level === planLevel)
  const building = mvpFootprint as { x: number; y: number; w: number; h: number } | undefined
  const planBounds = building?.w && building.h
    ? { x: building.x, z: building.y, w: building.w, d: building.h }
    : planFloor?.footprint
  const applyPreset = (value: CameraPreset) => {
    if (value === 'top' && !modelStage) {
      if (!planLens) setViewMode('floor_plan')
    } else {
      setOrbitPreset(value)
      if (planLens) setViewMode('3d')
    }
  }
  const choosePreset = (value: CameraPreset) => {
    if (value === preset) setFrameNonce((n) => n + 1)
    else applyPreset(value)
  }
  const roomDisplay = (room: (typeof rooms)[number]) =>
    shouldRenderCanvasObject(room, viewMode)
      ? floorDisplay(room.floorLevel ?? 0, planLevel, studio && ghostFloors)
      : 'hidden'
  const visibleRooms = rooms.filter((room) => roomDisplay(room) === 'active')
  const ghostRooms = studio ? rooms.filter((room) => roomDisplay(room) === 'ghost') : []
  const invalidRoomIds = useMemo(
    () => hardViolationRoomIds(parseMvpQuality({ mvpQuality })),
    [mvpQuality],
  )
  const camera =
    viewMode === '3d'
      ? { position: [10, 12, 10] as [number, number, number], fov: 50 }
      : { position: [0, 28, 0.01] as [number, number, number], fov: 42 }
  const background = studio
    ? `linear-gradient(180deg, #dde3ea 0%, ${MODEL_COLORS.sky} 55%, ${MODEL_COLORS.sky} 100%)`
    : `radial-gradient(circle at 50% 10%, ${EDITOR_PALETTE.workspaceHighlight} 0%, ${EDITOR_PALETTE.workspaceStart} 48%, ${EDITOR_PALETTE.workspaceEnd} 100%)`

  useCanvasKeyboardShortcuts({ disabled: readOnly })

  useEffect(() => {
    if (!clipboardMessage) return
    const timer = window.setTimeout(() => clearClipboardMessage(), 2200)
    return () => window.clearTimeout(timer)
  }, [clearClipboardMessage, clipboardMessage])

  return (
    <div
      className={className}
      style={{ background }}
      onContextMenu={readOnly ? undefined : (event) => event.preventDefault()}
    >
      <Canvas
        key={`${viewMode}:${modelStage}`}
        frameloop="demand"
        shadows={viewMode === '3d' ? 'percentage' : false}
        dpr={[1, 2]}
        camera={camera}
        // The studio composer multisamples itself; canvas MSAA there only
        // costs fill rate (~25-40% of the frame) for a full-screen blit.
        gl={{ preserveDrawingBuffer: true, antialias: !studio }}
        onPointerMissed={
          readOnly
            ? undefined
            : (event) => {
                const state = useCanvasStore.getState()
                if (
                  canClearSelectionFromEmptyCanvas({
                    interactionMode: state.interactionMode,
                    pointerIntent: state.pointerIntent,
                    placementArmed: state.placementMode !== null || state.interactionMode === 'place',
                    measureActive:
                      state.measureMode || state.interactionMode === 'measure' || state.showDimensions,
                    cameraAction: event.button === 1 || event.button === 2,
                    button: event.button,
                  })
                ) {
                  state.deselectAll()
                }
              }
        }
      >
        <Scene orbitRef={orbitRef} readOnly={readOnly} viewMode={viewMode} modelStage={modelStage} sunHour={sunHour} preset={preset} site={studio} level={planLevel} frameNonce={frameNonce} />
        {studio && <ViewCamera apiRef={viewCameraRef} preset={preset} />}
        {visibleRooms.map((r) => (
          <RoomMesh
            key={r.id}
            room={r}
            orbitRef={orbitRef}
            readOnly={readOnly}
            viewMode={viewMode}
            invalid={invalidRoomIds.has(r.id)}
            modelStage={modelStage}
            plan={topView}
          />
        ))}
        {topView && (
          <TopPlanOverlay
            orbitRef={orbitRef}
            readOnly={readOnly}
            rooms={visibleRooms}
            invalidRoomIds={invalidRoomIds}
            focusedRoomId={focusedRoomId}
            bounds={planBounds}
            y={(planFloor?.elevation ?? 0) + floorHeight + 0.4}
          />
        )}
        {studio && <MassLayer orbitRef={orbitRef} readOnly={readOnly} topView={topView} />}
        {studio && (
          <SiteLayer orbitRef={orbitRef} readOnly={readOnly} topView={topView} planY={(planFloor?.elevation ?? 0) + floorHeight + 0.4} />
        )}
        {ghostRooms.map((r) => (
          <RoomMesh key={r.id} room={r} orbitRef={orbitRef} readOnly viewMode={viewMode} modelStage={modelStage} ghost />
        ))}
        {/* Top reads as a drawing: no ambient occlusion (and no sun shadows, see Scene). */}
        {!(studio && !topView) && <RendererAutoClear />}
        {studio && !topView && (
          <EffectComposer multisampling={4}>
            <N8AO ref={aoRef as never} aoRadius={1.2} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes color="#1f1d1a" />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
        )}
        {studio && <PauseWhileMoving pass={aoRef} />}
        {SHOW_PERF && <PerfReadout />}
      </Canvas>
      {topView && !readOnly && (
        <TopPlanKeyboardLayer rooms={visibleRooms} invalidRoomIds={invalidRoomIds} onFocusRoom={setFocusedRoomId} />
      )}
      {studio && !readOnly && (
        <div className="pointer-events-none absolute bottom-12 left-4 z-10 hidden text-[10px] leading-relaxed text-muted-light xl:block">
          {topView ? (
            <>
              Click to select · drag selected to move · drag grips to resize<br />
              Double-click a polygon edge to add a corner, a corner to remove it<br />
              Right or middle drag to pan · scroll to zoom · Top again to fit
            </>
          ) : (
            <>Click to select · drag selected to move<br />Right drag to pan · middle drag to orbit</>
          )}
        </div>
      )}
      {studio && (
        <EditorDock
          className="bottom-[7.25rem]"
          preset={preset}
          onPreset={choosePreset}
          readOnly={readOnly}
          lenses={!modelStage}
          tools={{
            site: <SitePanel topView={topView} onRequestTop={() => applyPreset('top')} />,
            views: (!readOnly || hasSavedViews) && (
              <SavedViewsPanel
                readOnly={readOnly}
                capture={() => ({
                  ...viewCameraRef.current!.capture(),
                  preset,
                  sunHour,
                  selectedFloor,
                  ghostFloors,
                })}
                onRestore={restoreView}
              />
            ),
            sun: (
              <label className={DOCK_CARD}>
                <span className="font-semibold text-ink">Sun · {formatHour(sunHour)}</span>
                <span className="text-muted-light">{sunAt(sunHour).label}</span>
                <input
                  type="range"
                  aria-label="Time of day"
                  min={SUNRISE}
                  max={SUNSET}
                  step={0.5}
                  value={sunHour}
                  onChange={(event) => setSunHour(Number(event.target.value))}
                  className="accent-accent"
                />
              </label>
            ),
            floors: multiFloor && (
              <div role="group" aria-label="Other floors" className={DOCK_CARD}>
                <span className="font-semibold text-ink">Other floors</span>
                {selectedFloor === 'all' ? (
                  <span className="text-muted-light">Choose a level to hide or ghost the others.</span>
                ) : (
                  <div className="flex gap-0.5 rounded-lg bg-graphite-900/60 p-0.5">
                    <button type="button" aria-label="Hide other floors" aria-pressed={!ghostFloors} onClick={() => setGhostFloors(false)} className={segmentClass(!ghostFloors)}>Hide</button>
                    <button type="button" aria-label="Ghost other floors" aria-pressed={ghostFloors} onClick={() => setGhostFloors(true)} className={segmentClass(ghostFloors)}>Ghost</button>
                  </div>
                )}
              </div>
            ),
          }}
        />
      )}
      {studio && <MassingPanel readOnly={readOnly} topView={topView} plot={planBounds ?? null} />}
      {topView && selectedFloor === 'all' && planFloor && floors.length > 1 && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-28 z-20 -translate-x-1/2 rounded-full border border-warn/30 bg-graphite-800/95 px-3 py-1.5 text-[11px] font-medium text-warn shadow-sm">
          Top view shows {planFloor.name}. Choose a level to edit another floor.
        </div>
      )}
      {clipboardMessage && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-28 z-30 -translate-x-1/2 rounded-lg border border-ink/10 bg-graphite-800/95 px-3 py-2 text-xs font-medium text-ink shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
        >
          {clipboardMessage}
        </div>
      )}
    </div>
  )
}

/** The AO composer turns the renderer's autoClear off for good (postprocessing's
 * setRenderer) and never turns it back on; without the composer (Top view,
 * after visiting Persp/Axo) each frame would draw over the last one. */
function RendererAutoClear() {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    gl.autoClear = true
    invalidate()
  }, [gl, invalidate])
  return null
}
