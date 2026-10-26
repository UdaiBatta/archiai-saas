import { useEffect, useRef, type RefObject } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { type CanvasHistorySnapshot, type Room, useCanvasStore, workArea } from '../../store/canvasStore'
import { capabilitiesOf } from '../../store/componentRegistry'
import { formatArea } from '../../utils/format'
import { resizeRoomFromPlanHandle, type PlanBounds, type PlanPoint, type PlanResizeHandle } from './plan2dGeometry'
import {
  LABEL_PX,
  cloneRoom,
  dimensionStrings,
  planEditPatch,
  planHandlePoints,
  roomLabelLayout,
  roomPlanArea,
  roomWorldBounds,
  type DimensionString,
} from './topViewModel'
import { edgeCardinals, parseOrientation, type ScreenEdge } from './orientationModel'
import { EDITOR_PALETTE } from './editorPalette'
import { HANDLE_PX, HandleMark, usePixelsPerMetre } from './HandleMark'
import { MODEL_COLORS, PLAN_INK, type PlanInk } from './modelView'

interface OrbitHandle {
  enabled: boolean
}

interface TopPlanOverlayProps {
  orbitRef: RefObject<OrbitHandle>
  readOnly: boolean
  /** Objects on the plan level (already filtered for visibility). */
  rooms: Room[]
  invalidRoomIds: Set<string>
  /** Room focused through the keyboard layer: drawn with a focus ring. */
  focusedRoomId?: string | null
  /** Outline to dimension overall (the building slab), if any. */
  bounds?: PlanBounds
  /** Height the annotations float at: above everything on this level. */
  y: number
  /** Drawn over the dark blocks ground rather than the white model. */
  blocks?: boolean
}


interface ActiveEdit {
  pointerId: number
  startRoom: Room
  historySnapshot: CanvasHistorySnapshot
  handle: PlanResizeHandle
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const INWARD_ARROW: Record<ScreenEdge, string> = { top: '↓', bottom: '↑', left: '→', right: '←' }
const OUTWARD: Record<ScreenEdge, PlanPoint> = {
  top: { x: 0, z: -1 },
  bottom: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
}

const at = (point: PlanPoint, y: number): [number, number, number] => [point.x, y, point.z]

/** Local plan point -> world, with the SVG plan's rotation sense (door swings
 * and stair treads read exactly as they did in the 2D plan). */
function localToWorld(room: Room, x: number, z: number, y: number): [number, number, number] {
  const t = THREE.MathUtils.degToRad(Number.isFinite(room.rotation.y) ? room.rotation.y : 0)
  return [
    room.position.x + x * Math.cos(t) - z * Math.sin(t),
    y,
    room.position.z + x * Math.sin(t) + z * Math.cos(t),
  ]
}

/**
 * The drawing layer of the Top view: adaptive room labels, dimension
 * strings, plan symbols, violation outlines and the selected object's resize
 * handles. A room's points are shaped with ShapeHandles, as in 3D.
 */
export function TopPlanOverlay({ orbitRef, readOnly, rooms, invalidRoomIds, focusedRoomId = null, bounds, y, blocks = false }: TopPlanOverlayProps) {
  const ink = PLAN_INK[blocks ? 'blocks' : 'model']
  const pxPerMetre = usePixelsPerMetre()
  const gl = useThree((s) => s.gl)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const showDimensions = useCanvasStore((s) => s.showDimensions)
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)
  const updateRoom = useCanvasStore((s) => s.updateRoom)
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode)
  const setPointerIntent = useCanvasStore((s) => s.setPointerIntent)
  const activeRef = useRef<ActiveEdit | null>(null)
  const selected = rooms.find((room) => room.id === selectedId)
  const metre = 1 / pxPerMetre

  const restore = (start: Room) =>
    updateRoom(
      start.id,
      {
        position: start.position,
        size: start.size,
        ...(start.polygonVertices ? { polygonVertices: start.polygonVertices } : {}),
      },
      { log: false },
    )

  const reset = () => {
    activeRef.current = null
    if (orbitRef.current) orbitRef.current.enabled = true
    setInteractionMode('select')
    setPointerIntent('idle')
  }

  useEffect(() => {
    if (readOnly) return
    const cancel = () => {
      if (activeRef.current) {
        restore(activeRef.current.startRoom)
        reset()
      }
    }
    window.addEventListener('archiai:cancel-canvas-interaction', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('archiai:cancel-canvas-interaction', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [readOnly])

  const begin = (room: Room, handle: PlanResizeHandle) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    activeRef.current = {
      pointerId: event.pointerId,
      startRoom: cloneRoom(room),
      historySnapshot: useCanvasStore.getState().createHistorySnapshot(),
      handle,
    }
    if (orbitRef.current) orbitRef.current.enabled = false
    setInteractionMode('resize')
    setPointerIntent('resizing')
    ;(event.target as Element | null)?.setPointerCapture?.(event.pointerId)
  }

  const drag = (event: ThreeEvent<PointerEvent>) => {
    const active = activeRef.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(GROUND, hit)) return
    const state = useCanvasStore.getState()
    const options = {
      room: active.startRoom,
      point: { x: hit.x, z: hit.z },
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      footprint: workArea(state.floors.find((floor) => floor.level === (active.startRoom.floorLevel ?? 0))?.footprint),
    }
    const next = resizeRoomFromPlanHandle({ ...options, handle: active.handle })
    if (next) updateRoom(active.startRoom.id, next, { log: false })
  }

  const finish = (event: ThreeEvent<PointerEvent>) => {
    const active = activeRef.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    const current = useCanvasStore.getState().rooms.find((room) => room.id === active.startRoom.id)
    const patch = current ? planEditPatch(active.startRoom, current) : null
    if (patch && event.type === 'pointercancel') {
      restore(active.startRoom)
    } else if (patch) {
      updateRoom(active.startRoom.id, patch, {
        action: 'object.resized',
        previousValue: active.startRoom,
        historySnapshot: active.historySnapshot,
      })
    }
    ;(event.target as Element | null)?.releasePointerCapture?.(event.pointerId)
    reset()
  }

  const handleProps = (cursor: string) => ({
    onPointerMove: drag,
    onPointerUp: finish,
    onPointerCancel: finish,
    onPointerOver: () => { gl.domElement.style.cursor = cursor },
    onPointerOut: () => { gl.domElement.style.cursor = '' },
  })

  const handleSize = HANDLE_PX.corner * metre
  const editable =
    selected && !readOnly && capabilitiesOf(selected).canResize ? selected : null

  // Main-entry marker, as the 2D plan drew it: outside the entry door,
  // pointing in from the facing edge.
  const orientation = parseOrientation(layoutMetadata)
  const facing = orientation?.facingDirection ?? orientation?.entrySide
  const cardinals = orientation ? edgeCardinals(orientation) : null
  const facingEdge = cardinals && (Object.keys(cardinals) as ScreenEdge[]).find((edge) => cardinals[edge] === facing)
  const entryDoor = rooms.find((room) => room.objectType === 'door' && room.label === 'Entry Door')

  return (
    <group>
      {bounds && bounds.w > 0 && bounds.d > 0 && (
        <Dimensions strings={dimensionStrings(bounds, Math.max(0.9, 34 * metre))} y={y} strong testId="overall" ink={ink} />
      )}

      {rooms.map((room) => {
        const definition = capabilitiesOf(room)
        const isSelected = room.id === selectedId
        const invalid = invalidRoomIds.has(room.id)
        const world = roomWorldBounds(room)
        const thin =
          definition.renderingTreatment === 'thin' ||
          definition.category === 'opening' ||
          definition.category === 'structure'
        const label = roomLabelLayout({
          label: room.label,
          w: world.w,
          d: world.d,
          pxPerMetre,
          isSpace: definition.category === 'space',
        })
        const outline = room.polygonVertices ?? [
          { x: world.x, z: world.z },
          { x: world.x + world.w, z: world.z },
          { x: world.x + world.w, z: world.z + world.d },
          { x: world.x, z: world.z + world.d },
        ]
        const { w, d } = room.size
        return (
          <group key={room.id}>
            {room.id === focusedRoomId && (
              <Line
                name={`focus-ring-${room.id}`}
                points={[...outline, outline[0]].map((p) => at(p, y + 0.05))}
                color={EDITOR_PALETTE.selection}
                lineWidth={4}
              />
            )}
            {invalid && (
              <Line
                points={[...outline, outline[0]].map((p) => at(p, y))}
                color={MODEL_COLORS.invalid}
                lineWidth={2.5}
                dashed
                dashSize={0.35}
                gapSize={0.18}
              />
            )}
            {room.objectType === 'door' && (
              <>
                <Line
                  points={Array.from({ length: 13 }, (_, i) => {
                    const t = Math.PI + (i / 12) * (Math.PI / 2)
                    return localToWorld(room, w / 2 + Math.cos(t) * w, d / 2 + Math.sin(t) * w, y)
                  })}
                  color={ink.faint}
                  lineWidth={1}
                  dashed
                  dashSize={0.12}
                  gapSize={0.08}
                />
                <Line
                  points={[localToWorld(room, w / 2, d / 2, y), localToWorld(room, w / 2, d / 2 - w, y)]}
                  color={ink.line}
                  lineWidth={1.2}
                />
              </>
            )}
            {room.objectType === 'stair' &&
              [1, 2, 3, 4, 5].map((step) => (
                <Line
                  key={step}
                  points={[
                    localToWorld(room, -w / 2, -d / 2 + (d * step) / 6, y),
                    localToWorld(room, w / 2, -d / 2 + (d * step) / 6, y),
                  ]}
                  color={ink.faint}
                  lineWidth={1}
                />
              ))}
            {(!thin || isSelected) && label.showName && (
              <Html
                position={[room.position.x, y, room.position.z]}
                center
                zIndexRange={[1, 0]}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  data-testid={`top-label-${room.id}`}
                  className="whitespace-nowrap text-center leading-tight"
                  style={{
                    color: invalid ? MODEL_COLORS.invalid : ink.text,
                    textShadow: `0 0 3px ${ink.halo}, 0 0 3px ${ink.halo}, 0 0 2px ${ink.halo}`,
                  }}
                >
                  <div style={{ fontSize: label.nameFontPx, fontWeight: isSelected ? 700 : 550 }}>
                    {invalid ? '! ' : ''}
                    {room.label}
                  </div>
                  {label.showArea && (
                    <div className="font-mono tabular-nums" style={{ fontSize: LABEL_PX * 0.8, opacity: 0.7 }}>
                      {formatArea(roomPlanArea(room))}
                    </div>
                  )}
                </div>
              </Html>
            )}
            {definition.canResize && (isSelected || (showDimensions && definition.category === 'space')) && (
              <Dimensions
                strings={dimensionStrings(world, Math.max(0.35, 16 * metre))}
                y={y}
                strong={isSelected}
                testId={room.id}
                ink={ink}
              />
            )}
          </group>
        )
      })}

      {entryDoor && facingEdge && (
        <Html
          position={[
            entryDoor.position.x + OUTWARD[facingEdge].x * 1.4,
            y,
            entryDoor.position.z + OUTWARD[facingEdge].z * 1.4,
          ]}
          center
          zIndexRange={[1, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <span className="whitespace-nowrap text-[10px] font-semibold" style={{ color: ink.text }}>
            {INWARD_ARROW[facingEdge]} Main entry
          </span>
        </Html>
      )}

      {editable && !editable.polygonVertices &&
        planHandlePoints(editable)
          // A room's edge midpoints add points (ShapeHandles), so it keeps only its corners here.
          .filter((point) => editable.objectType !== 'room' || (point.handle.sx !== 0 && point.handle.sz !== 0))
          .map((point) => (
            <HandleMark
              key={point.handle.key}
              name={`plan-resize-${editable.id}-${point.handle.key}`}
              position={[point.x, y + 0.2, point.z]}
              size={handleSize}
              onPointerDown={begin(editable, point.handle)}
              {...handleProps(point.cursor)}
            />
          ))}
    </group>
  )
}

function Dimensions({ strings, y, strong, testId, ink }: { strings: DimensionString[]; y: number; strong: boolean; testId: string; ink: PlanInk }) {
  const color = strong ? ink.line : ink.faint
  return (
    <group name={`dimensions-${testId}`}>
      {strings.map((string) => (
        <group key={string.text + string.vertical}>
          <Line points={[at(string.start, y), at(string.end, y)]} color={color} lineWidth={strong ? 1.2 : 0.8} />
          {[...string.ticks, ...string.extensions].map(([a, b], index) => (
            <Line key={index} points={[at(a, y), at(b, y)]} color={color} lineWidth={0.8} />
          ))}
          <Html position={at(string.label, y)} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
            <span
              className="block whitespace-nowrap rounded-sm px-1 font-mono text-[10px] tabular-nums"
              style={{
                color,
                background: ink.chip,
                transform: string.vertical ? 'rotate(-90deg)' : undefined,
              }}
            >
              {string.text}
            </span>
          </Html>
        </group>
      ))}
    </group>
  )
}
