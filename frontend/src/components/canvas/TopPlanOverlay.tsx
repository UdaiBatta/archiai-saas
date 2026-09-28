import { useEffect, useRef, useState, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { type CanvasHistorySnapshot, type Room, useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { formatArea } from '../../utils/format'
import {
  insertPolygonVertex,
  movePolygonVertex,
  removePolygonVertex,
  resizeRoomFromPlanHandle,
  type PlanBounds,
  type PlanPoint,
  type PlanResizeHandle,
} from './plan2dGeometry'
import {
  LABEL_PX,
  cloneRoom,
  dimensionStrings,
  planEditPatch,
  planHandlePoints,
  polygonEdgeMidpoints,
  roomLabelLayout,
  roomPlanArea,
  roomWorldBounds,
  type DimensionString,
} from './topViewModel'
import { edgeCardinals, parseOrientation, type ScreenEdge } from './orientationModel'
import { EDITOR_PALETTE } from './editorPalette'
import { MODEL_COLORS } from './modelView'

interface OrbitHandle {
  enabled: boolean
}

interface TopPlanOverlayProps {
  orbitRef: RefObject<OrbitHandle>
  readOnly: boolean
  /** Objects on the plan level (already filtered for visibility). */
  rooms: Room[]
  invalidRoomIds: Set<string>
  /** Outline to dimension overall (the building slab), if any. */
  bounds?: PlanBounds
  /** Height the annotations float at: above everything on this level. */
  y: number
}

type EditKind = { type: 'resize'; handle: PlanResizeHandle } | { type: 'vertex'; index: number }

interface ActiveEdit {
  pointerId: number
  startRoom: Room
  historySnapshot: CanvasHistorySnapshot
  kind: EditKind
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const HANDLE_PX = 11
const INWARD_ARROW: Record<ScreenEdge, string> = { top: '↓', bottom: '↑', left: '→', right: '←' }
const OUTWARD: Record<ScreenEdge, PlanPoint> = {
  top: { x: 0, z: -1 },
  bottom: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
}

/** Orthographic zoom = screen pixels per metre; re-rendered only on a real change. */
function usePixelsPerMetre() {
  const [zoom, setZoom] = useState(30)
  const last = useRef(zoom)
  useFrame(({ camera }) => {
    if (Math.abs(camera.zoom - last.current) / camera.zoom > 0.02) {
      last.current = camera.zoom
      setZoom(camera.zoom)
    }
  })
  return zoom
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
 * strings, plan symbols, violation outlines and the selected room's resize /
 * vertex handles - the editing surface the SVG plan used to provide.
 */
export function TopPlanOverlay({ orbitRef, readOnly, rooms, invalidRoomIds, bounds, y }: TopPlanOverlayProps) {
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

  const begin = (room: Room, kind: EditKind) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    activeRef.current = {
      pointerId: event.pointerId,
      startRoom: cloneRoom(room),
      historySnapshot: useCanvasStore.getState().createHistorySnapshot(),
      kind,
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
      footprint: state.floors.find((floor) => floor.level === (active.startRoom.floorLevel ?? 0))?.footprint,
    }
    const next =
      active.kind.type === 'resize'
        ? resizeRoomFromPlanHandle({ ...options, handle: active.kind.handle })
        : movePolygonVertex({ ...options, vertexIndex: active.kind.index })
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

  const editPolygon = (room: Room, next: ReturnType<typeof insertPolygonVertex>) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (next) updateRoom(room.id, next, { action: 'object.resized', previousValue: cloneRoom(room) })
  }

  const handleProps = (cursor: string) => ({
    onPointerMove: drag,
    onPointerUp: finish,
    onPointerCancel: finish,
    onPointerOver: () => { gl.domElement.style.cursor = cursor },
    onPointerOut: () => { gl.domElement.style.cursor = '' },
  })

  const handleSize = HANDLE_PX * metre
  const editable =
    selected && !readOnly && COMPONENT_REGISTRY[selected.objectType].canResize ? selected : null

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
        <Dimensions strings={dimensionStrings(bounds, Math.max(0.9, 34 * metre))} y={y} strong testId="overall" />
      )}

      {rooms.map((room) => {
        const definition = COMPONENT_REGISTRY[room.objectType]
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
                  color={MODEL_COLORS.floorEdge}
                  lineWidth={1}
                  dashed
                  dashSize={0.12}
                  gapSize={0.08}
                />
                <Line
                  points={[localToWorld(room, w / 2, d / 2, y), localToWorld(room, w / 2, d / 2 - w, y)]}
                  color={MODEL_COLORS.edge}
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
                  color={MODEL_COLORS.floorEdge}
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
                    color: invalid ? MODEL_COLORS.invalid : MODEL_COLORS.plotLine,
                    textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff',
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
            {definition.canResize && (isSelected || showDimensions) && (
              <Dimensions
                strings={dimensionStrings(world, Math.max(0.35, 16 * metre))}
                y={y}
                strong={isSelected}
                testId={room.id}
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
          <span className="whitespace-nowrap text-[10px] font-semibold" style={{ color: MODEL_COLORS.plotLine }}>
            {INWARD_ARROW[facingEdge]} Main entry
          </span>
        </Html>
      )}

      {editable && !editable.polygonVertices &&
        planHandlePoints(editable).map((point) => (
          <HandleMark
            key={point.handle.key}
            name={`plan-resize-${editable.id}-${point.handle.key}`}
            position={[point.x, y + 0.2, point.z]}
            size={handleSize}
            onPointerDown={begin(editable, { type: 'resize', handle: point.handle })}
            {...handleProps(point.cursor)}
          />
        ))}

      {editable?.polygonVertices && (
        <>
          {polygonEdgeMidpoints(editable.polygonVertices).map((point, index) => (
            <HandleMark
              key={`edge-${index}`}
              name={`plan-vertex-edge-${editable.id}-${index}`}
              position={[point.x, y + 0.1, point.z]}
              size={handleSize * 0.7}
              round
              faint
              onDoubleClick={editPolygon(editable, insertPolygonVertex(editable, index))}
              onPointerOver={() => { gl.domElement.style.cursor = 'copy' }}
              onPointerOut={() => { gl.domElement.style.cursor = '' }}
            />
          ))}
          {editable.polygonVertices.map((vertex, index) => (
            <HandleMark
              key={`vertex-${index}`}
              name={`plan-vertex-${editable.id}-${index}`}
              position={[vertex.x, y + 0.2, vertex.z]}
              size={handleSize}
              round
              onPointerDown={begin(editable, { type: 'vertex', index })}
              onDoubleClick={editPolygon(editable, removePolygonVertex(editable, index))}
              {...handleProps('move')}
            />
          ))}
        </>
      )}
    </group>
  )
}

function Dimensions({ strings, y, strong, testId }: { strings: DimensionString[]; y: number; strong: boolean; testId: string }) {
  const color = strong ? MODEL_COLORS.plotLine : MODEL_COLORS.floorEdge
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
                background: MODEL_COLORS.plot,
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

interface HandleMarkProps {
  name: string
  position: [number, number, number]
  size: number
  round?: boolean
  faint?: boolean
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void
  onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void
  onPointerOver?: () => void
  onPointerOut?: () => void
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
}

/** A flat, screen-constant grip drawn over everything. */
function HandleMark({ name, position, size, round, faint, ...events }: HandleMarkProps) {
  const shape = (s: number) => (round ? <circleGeometry args={[s / 2, 20]} /> : <planeGeometry args={[s, s]} />)
  return (
    <group position={position}>
      <mesh name={name} rotation={[-Math.PI / 2, 0, 0]} renderOrder={31} {...events}>
        {shape(size)}
        <meshBasicMaterial color={EDITOR_PALETTE.selection} transparent opacity={faint ? 0.45 : 1} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={30} raycast={() => null}>
        {shape(size * 1.35)}
        <meshBasicMaterial color="#ffffff" transparent opacity={faint ? 0.6 : 1} depthTest={false} />
      </mesh>
    </group>
  )
}
