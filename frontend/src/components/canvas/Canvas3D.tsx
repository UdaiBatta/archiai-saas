import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'
import { EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Scene } from './Scene'
import { RoomMesh as RoomMeshBase } from './RoomMesh'
import { MergedModel } from './MergedModel'
import { isMergeable } from './mergedGeometry'
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
import { MODEL_COLORS, PERSPECTIVE_FOV, floorDisplay, type CameraPreset } from './modelView'
import { DOCK_CARD, EditorDock } from './EditorDock'
import { SavedViewsPanel, ViewCamera, type ViewCameraApi } from './SavedViewsPanel'
import { parseSavedViews, restorableFloor, type SavedView } from './savedViews'
import { MassLayer } from '../../site/MassLayer'
import { MassingPanel } from '../../site/MassingPanel'
import { AssistantPanel } from './AssistantPanel'
import { SiteLayer } from '../../site/SiteLayer'
import { SitePanel } from '../../site/SitePanel'
import { useSiteAndMasses } from '../../site/massStore'
import { zoningIssues } from '../../site/massing'

// Props are stable per room, so metadata or UI-state changes in this
// component no longer re-render every room.
const RoomMesh = memo(RoomMeshBase)

const AO_KEY = 'archiai:ambient-occlusion'

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
  /** False while something (e.g. the brief editor) covers the canvas. */
  dock?: boolean
}

export function Canvas3D({ className, readOnly = false, modelStage = false, briefBackground = false, initialPreset = 'perspective', dock = true }: Canvas3DProps) {
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
  // Ambient occlusion is a presentation option, off by default: a full-screen
  // pass at 4x multisampling was the heaviest thing left in Persp on laptop
  // GPUs. Remembered per browser; dropped automatically if frames slow down.
  const [aoWanted, setAoWanted] = useState(() => {
    try { return window.localStorage.getItem(AO_KEY) === '1' } catch { return false }
  })
  const chooseAo = (on: boolean) => {
    setAoWanted(on)
    try { window.localStorage.setItem(AO_KEY, on ? '1' : '0') } catch { /* private mode */ }
  }
  const aoOn = studio && preset === 'perspective' && aoWanted
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
  const siteAndMasses = useSiteAndMasses()
  const zoningIssueCount = useMemo(
    () => zoningIssues(siteAndMasses.site, siteAndMasses.masses).length,
    [siteAndMasses.site, siteAndMasses.masses],
  )
  const choosePreset = (value: CameraPreset) => {
    if (value === preset) setFrameNonce((n) => n + 1)
    else applyPreset(value)
  }
  const roomDisplay = (room: (typeof rooms)[number]) =>
    shouldRenderCanvasObject(room, viewMode)
      ? floorDisplay(room.floorLevel ?? 0, planLevel, studio && ghostFloors)
      : 'hidden'
  const visibleRooms = rooms.filter((room) => roomDisplay(room) === 'active')
  // Walls, floors and windows draw as one merged model (3 draw calls). The
  // selection stays a RoomMesh so it can be dragged without rebuilding the
  // model; a selected door/window keeps its host wall out too, since the
  // wall's openings follow it.
  const selectedId = useCanvasStore((s) => s.selectedId)
  const solidModel = modelStage || viewMode === '3d'
  const selectedObject = selectedId ? visibleRooms.find((room) => room.id === selectedId) : undefined
  const keepApart = new Set([selectedId, selectedObject?.hostWallId].filter(Boolean) as string[])
  const merged = (room: (typeof rooms)[number]) => solidModel && isMergeable(room) && !keepApart.has(room.id)
  const mergedObjects = visibleRooms.filter(merged)
  const individualRooms = visibleRooms.filter((room) => !merged(room))
  const openings = visibleRooms.filter((room) => room.objectType === 'door' || room.objectType === 'window')
  // Frame the building, not the whole plot: a house on a large plot should
  // fill the view (the plot, site and masses still widen it when present).
  const focus = useMemo(() => {
    const spaces = visibleRooms.filter((room) => room.objectType === 'room')
    if (!spaces.length) return null
    const xs = spaces.flatMap((room) => [room.position.x - room.size.w / 2, room.position.x + room.size.w / 2])
    const zs = spaces.flatMap((room) => [room.position.z - room.size.d / 2, room.position.z + room.size.d / 2])
    const x = Math.min(...xs)
    const z = Math.min(...zs)
    return { x, z, w: Math.max(...xs) - x, d: Math.max(...zs) - z }
  }, [visibleRooms])
  const ghostRooms = studio ? rooms.filter((room) => roomDisplay(room) === 'ghost') : []
  const invalidRoomIds = useMemo(
    () => hardViolationRoomIds(parseMvpQuality({ mvpQuality })),
    [mvpQuality],
  )
  const camera =
    viewMode === '3d'
      ? { position: [10, 12, 10] as [number, number, number], fov: PERSPECTIVE_FOV }
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
        // Drop to half resolution while moving (see PauseWhileMoving).
        performance={{ min: 0.5 }}
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
        <Scene orbitRef={orbitRef} readOnly={readOnly} viewMode={viewMode} modelStage={modelStage} sunHour={sunHour} preset={preset} site={studio} level={planLevel} frameNonce={frameNonce} focus={focus} />
        {studio && <ViewCamera apiRef={viewCameraRef} preset={preset} />}
        {solidModel && (
          <MergedModel objects={mergedObjects} openings={openings} invalidRoomIds={invalidRoomIds} readOnly={readOnly} plan={topView} />
        )}
        {individualRooms.map((r) => (
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
        {/* Ambient occlusion only in Persp: Top and Axo are drawings (orthographic),
            and AO under an orthographic camera was costly enough to slow the
            whole window. Top also drops sun shadows (see Scene). */}
        {!aoOn && <RendererAutoClear />}
        {/* The view cube (Scene, Persp/Axo) renders at priority 2, which stops
            R3F's own render; in Persp the AO composer draws the scene, so
            without it (Axo) something must, or the canvas stays blank. */}
        {studio && !aoOn && !topView && <MainScenePass />}
        {aoOn && (
          <EffectComposer multisampling={4}>
            <N8AO ref={aoRef as never} aoRadius={1.2} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes color="#1f1d1a" />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          </EffectComposer>
        )}
        {studio && <PauseWhileMoving pass={aoRef} />}
        {studio && <AdaptiveDpr />}
        {studio && preset !== 'perspective' && <OrthoZoom />}
        {aoOn && <PerformanceMonitor onDecline={() => chooseAo(false)} />}
        {SHOW_PERF && <PerfReadout />}
      </Canvas>
      {topView && !readOnly && (
        <TopPlanKeyboardLayer rooms={visibleRooms} invalidRoomIds={invalidRoomIds} onFocusRoom={setFocusedRoomId} />
      )}
      {studio && dock && (
        <EditorDock
          className="bottom-12"
          preset={preset}
          onPreset={choosePreset}
          readOnly={readOnly}
          modelStage={modelStage}
          alerts={{ massing: zoningIssueCount }}
          tools={{
            assistant: !readOnly && !modelStage && <AssistantPanel />,
            site: <SitePanel defaultOpen topView={topView} onRequestTop={() => applyPreset('top')} />,
            massing: <MassingPanel docked readOnly={readOnly} topView={topView} plot={planBounds ?? null} />,
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
              <div className={DOCK_CARD}>
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
                <label className="mt-1 flex items-center justify-between gap-3 border-t border-ink/10 pt-2">
                  <span>
                    <span className="block text-ink">Ambient occlusion</span>
                    <span className="text-muted-light">Softer contact shading, Persp only. Slower.</span>
                  </span>
                  <input type="checkbox" role="switch" aria-checked={aoWanted} checked={aoWanted} onChange={(event) => chooseAo(event.target.checked)} className="h-4 w-4 accent-accent" />
                </label>
              </div>
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
      {topView && selectedFloor === 'all' && planFloor && floors.length > 1 && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-28 z-20 -translate-x-1/2 rounded-full border border-warn/30 bg-graphite-800/95 px-3 py-1.5 text-[11px] font-medium text-warn shadow-sm">
          Top view shows {planFloor.name}. Choose a level to edit another floor.
        </div>
      )}
      {studio && preset !== 'perspective' && (
        <div role="group" aria-label="Zoom" className="absolute bottom-14 right-3 z-20 flex flex-col overflow-hidden rounded-xl border border-ink/10 bg-graphite-800/95 shadow-lg backdrop-blur">
          {([['in', '+', 'Zoom in'], ['out', '−', 'Zoom out']] as const).map(([dir, glyph, label]) => (
            <button key={dir} type="button" aria-label={label} title={label} onClick={() => window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: dir }))} className="h-8 w-8 text-base leading-none text-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:bg-ink/10 focus-visible:outline-none">
              {glyph}
            </button>
          ))}
          <button type="button" aria-label="Zoom to fit" title="Zoom to fit" onClick={() => setFrameNonce((n) => n + 1)} className="h-8 w-8 border-t border-ink/10 text-[10px] font-semibold text-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:bg-ink/10 focus-visible:outline-none">
            FIT
          </button>
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

/** Draws the scene when a higher-priority frame callback (the view cube) has
 * taken over rendering and no composer is there to draw it. */
function MainScenePass() {
  useFrame(({ gl, scene, camera }) => {
    gl.autoClear = true
    gl.render(scene, camera)
  }, 1)
  return null
}

const ZOOM_EVENT = 'archiai:ortho-zoom'

/** +/- for the orthographic views (Top, Axo): scale the camera's zoom. */
function OrthoZoom() {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const onZoom = (event: Event) => {
      const factor = (event as CustomEvent<'in' | 'out'>).detail === 'in' ? 1.25 : 0.8
      camera.zoom = Math.min(400, Math.max(1, camera.zoom * factor))
      camera.updateProjectionMatrix()
      invalidate()
    }
    window.addEventListener(ZOOM_EVENT, onZoom)
    return () => window.removeEventListener(ZOOM_EVENT, onZoom)
  }, [camera, invalidate])
  return null
}
