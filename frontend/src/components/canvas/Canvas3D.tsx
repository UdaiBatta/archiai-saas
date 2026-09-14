import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './Scene'
import { RoomMesh } from './RoomMesh'
import { useCanvasStore } from '../../store/canvasStore'
import { canClearSelectionFromEmptyCanvas } from '../../store/interactionModel'
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts'
import { shouldRenderCanvasObject } from './canvasObjectVisibility'
import { EDITOR_PALETTE } from './editorPalette'
import { hardViolationRoomIds, parseMvpQuality } from './qualityModel'

interface Canvas3DProps {
  className?: string
  readOnly?: boolean
  modelStage?: boolean
  briefBackground?: boolean
}

export function Canvas3D({ className, readOnly = false, modelStage = false, briefBackground = false }: Canvas3DProps) {
  const orbitRef = useRef<{ enabled: boolean }>(null)
  const rooms = useCanvasStore((s) => s.rooms)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const storedViewMode = useCanvasStore((s) => s.viewMode)
  const viewMode = briefBackground ? '3d' : storedViewMode
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)
  const clipboardMessage = useCanvasStore((s) => s.clipboardMessage)
  const clearClipboardMessage = useCanvasStore((s) => s.clearClipboardMessage)
  const visibleRooms =
    selectedFloor === 'all'
      ? rooms.filter((room) => shouldRenderCanvasObject(room, viewMode))
      : rooms.filter(
          (room) =>
            (room.floorLevel ?? 0) === selectedFloor &&
            shouldRenderCanvasObject(room, viewMode),
        )
  const invalidRoomIds = useMemo(
    () => hardViolationRoomIds(parseMvpQuality(layoutMetadata)),
    [layoutMetadata],
  )
  const camera =
    viewMode === '3d'
      ? { position: [10, 12, 10] as [number, number, number], fov: 50 }
      : { position: [0, 28, 0.01] as [number, number, number], fov: 42 }
  const background = `radial-gradient(circle at 50% 10%, ${EDITOR_PALETTE.workspaceHighlight} 0%, ${EDITOR_PALETTE.workspaceStart} 48%, ${EDITOR_PALETTE.workspaceEnd} 100%)`

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
        shadows={viewMode === '3d'}
        dpr={[1, 2]}
        camera={camera}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
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
        <Scene orbitRef={orbitRef} readOnly={readOnly} viewMode={viewMode} modelStage={modelStage} />
        {visibleRooms.map((r) => (
          <RoomMesh
            key={r.id}
            room={r}
            orbitRef={orbitRef}
            readOnly={readOnly}
            viewMode={viewMode}
            invalid={invalidRoomIds.has(r.id)}
            modelStage={modelStage}
          />
        ))}
      </Canvas>
      {viewMode === '3d' && !readOnly && (
        <div className="pointer-events-none absolute bottom-64 left-4 hidden max-w-[12rem] text-[10px] leading-relaxed text-muted-light xl:block">
          Click to select · drag selected to move<br />Right drag to pan · middle drag to orbit
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
