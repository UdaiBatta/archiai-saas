import { useEffect, useMemo, useRef } from 'react'
import { Edges, Html } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import type { RefObject } from 'react'
import * as THREE from 'three'
import { CanvasHistorySnapshot, CanvasViewMode, Room, useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import {
  hasCrossedMoveThreshold,
  isPrimaryPointerButton,
  objectPointerIntent,
  type ScreenPoint,
} from '../../store/interactionModel'
import { DimensionAnnotations } from './DimensionAnnotations'
import { ResizeHandles } from './ResizeHandles'
import { roomVisualTreatment } from './roomVisualTreatment'
import { EDITOR_PALETTE, displayRoomColor } from './editorPalette'
import { wallModelPieces } from './modelGeometry'
import { MODEL_COLORS, floorTint, mixHex } from './modelView'
import { roomLabelLayout, roomPlanArea, roomWorldBounds } from './topViewModel'
import { formatArea, formatDims } from '../../utils/format'

interface OrbitHandle {
  enabled: boolean
}

interface RoomMeshProps {
  room: Room
  orbitRef: RefObject<OrbitHandle>
  readOnly?: boolean
  viewMode?: CanvasViewMode
  invalid?: boolean
  modelStage?: boolean
  /** Context from another floor: translucent, not interactive. */
  ghost?: boolean
  /** Top plan view: labels, dimensions and handles come from TopPlanOverlay. */
  plan?: boolean
}

interface PendingMove {
  pointerId: number
  startScreen: ScreenPoint
  startRoom: Room
  historySnapshot: CanvasHistorySnapshot
  plane: THREE.Plane
  offset: { x: number; z: number }
  moving: boolean
}

function cloneRoomForInteraction(room: Room): Room {
  return {
    ...room,
    position: { ...room.position },
    size: { ...room.size },
    rotation: { ...room.rotation },
    polygonVertices: room.polygonVertices?.map((vertex) => ({ ...vertex })),
  }
}

/** Position (and a polygon room's outline, which is absolute) of `room` moved to `position`. */
function movedTo(room: Room, position: Room['position']): Partial<Room> {
  const dx = position.x - room.position.x
  const dz = position.z - room.position.z
  return room.polygonVertices
    ? { position, polygonVertices: room.polygonVertices.map((v) => ({ x: v.x + dx, z: v.z + dz })) }
    : { position }
}

/** Edge lines of a w x h x d box, rebuilt only when the size changes and
 * freed when it does (the source box is freed at once). */
function useBoxEdges(w: number, h: number, d: number) {
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(w, h, d)
    const geometry = new THREE.EdgesGeometry(box)
    box.dispose()
    return geometry
  }, [w, h, d])
  useEffect(() => () => edges.dispose(), [edges])
  return edges
}

export function RoomMesh({
  room,
  orbitRef,
  readOnly = false,
  viewMode = '3d',
  invalid = false,
  modelStage = false,
  ghost = false,
  plan = false,
}: RoomMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const canvasElement = useThree((s) => s.gl.domElement)
  const camera = useThree((s) => s.camera)
  const pendingMoveRef = useRef<PendingMove | null>(null)
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  const updateRoom = useCanvasStore((s) => s.updateRoom)
  const showDimensions = useCanvasStore((s) => s.showDimensions)
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode)
  const setPointerIntent = useCanvasStore((s) => s.setPointerIntent)
  const objects = useCanvasStore((s) => s.rooms)
  // Both 3D views draw the real building: engine walls with door openings
  // cut out and rooms as floor slabs, so an open-plan edge (no wall) reads
  // as one continuous space instead of two outlined boxes.
  const solid3d = modelStage || viewMode === '3d'
  const wallPieces = useMemo(() => solid3d && room.objectType === 'wall'
    ? wallModelPieces(room, objects.filter((object) => object.objectType === 'door' || object.objectType === 'window'))
    : null, [solid3d, room, objects])

  const isSelected = selectedId === room.id
  const definition = COMPONENT_REGISTRY[room.objectType]
  const isThinComponent =
    definition.renderingTreatment === 'thin' ||
    definition.category === 'opening' ||
    definition.category === 'structure'
  const isDimensionable = definition.canResize
  const isPlanView = viewMode !== '3d'
  const isSpace = definition.category === 'space'
  const modelSurface = solid3d && (isSpace || (room.objectType === 'door' && typeof room.hostWallId === 'string'))
  const renderHeight = modelSurface ? 0.045 : room.size.h
  const boxEdges = useBoxEdges(room.size.w, room.size.h, room.size.d)
  const selectionEdges = useBoxEdges(room.size.w + 0.08, Math.max(renderHeight + 0.08, 0.12), room.size.d + 0.08)
  const renderY = modelSurface ? room.position.y - room.size.h / 2 + renderHeight / 2 : room.position.y
  const modelFurniture = modelStage && room.objectType === 'furniture'
  // White model: matte surfaces, floors keep a pale tint of their room colour,
  // windows read as glass.
  const isGlass = solid3d && room.objectType === 'window'
  const noRaycast = () => null
  const modelColor = isSelected
    ? MODEL_COLORS.wallSelected
    : isGlass
      ? MODEL_COLORS.glass
      : invalid
        ? mixHex(floorTint(displayRoomColor(room)), MODEL_COLORS.invalid, 0.35)
        : floorTint(displayRoomColor(room))
  // A polygon room's floor follows its outline, not its bounding box.
  const polygonSlab = useMemo(() => {
    const vertices = room.polygonVertices
    if (!modelSurface || !vertices || vertices.length < 3) return null
    const shape = new THREE.Shape(
      vertices.map((v) => new THREE.Vector2(v.x - room.position.x, v.z - room.position.z)),
    )
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: renderHeight, bevelEnabled: false })
    // Shape y -> world z, extrusion -> y centred on the slab.
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, renderHeight / 2, 0)
    return geometry
  }, [modelSurface, room.polygonVertices, room.position.x, room.position.z, renderHeight])
  useEffect(() => () => polygonSlab?.dispose(), [polygonSlab])
  const see = ghost ? 0.12 : isGlass ? 0.35 : 1
  const edgeColor = isSpace ? MODEL_COLORS.floorEdge : MODEL_COLORS.edge
  const visual = roomVisualTreatment(
    definition,
    room.objectType,
    isSelected,
    isPlanView,
    invalid,
  )

  const resetMoveState = () => {
    pendingMoveRef.current = null
    setInteractionMode('select')
    setPointerIntent('idle')
    if (orbitRef.current) orbitRef.current.enabled = true
  }

  useEffect(() => {
    if (readOnly) return
    const cancelInteraction = () => {
      const pending = pendingMoveRef.current
      if (pending?.moving) {
        updateRoom(room.id, movedTo(pending.startRoom, pending.startRoom.position), { log: false })
      }
      resetMoveState()
    }

    window.addEventListener('archiai:cancel-canvas-interaction', cancelInteraction)
    return () => window.removeEventListener('archiai:cancel-canvas-interaction', cancelInteraction)
  }, [readOnly, room.id, updateRoom])

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (readOnly) return
    if (!isPrimaryPointerButton(event.button)) return
    const state = useCanvasStore.getState()
    if (state.placementMode) {
      event.stopPropagation()
      state.addObjectAt(state.placementMode, event.point.x, event.point.z)
      return
    }

    const intent = objectPointerIntent(event.button, isSelected, definition)
    if (intent === 'idle') return

    event.stopPropagation()

    if (intent === 'selecting') {
      selectRoom(room.id)
      setPointerIntent('idle')
      return
    }

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -room.position.y)
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(plane, hit)) {
      setPointerIntent('idle')
      return
    }

    pendingMoveRef.current = {
      pointerId: event.pointerId,
      startScreen: { x: event.clientX, y: event.clientY },
      startRoom: cloneRoomForInteraction(room),
      historySnapshot: useCanvasStore.getState().createHistorySnapshot(),
      plane,
      offset: {
        x: hit.x - room.position.x,
        z: hit.z - room.position.z,
      },
      moving: false,
    }
    setPointerIntent('pendingMove')
  }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const pending = pendingMoveRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    event.stopPropagation()

    if (!pending.moving) {
      if (!hasCrossedMoveThreshold(pending.startScreen, { x: event.clientX, y: event.clientY })) {
        return
      }
      pending.moving = true
      setInteractionMode('move')
      setPointerIntent('moving')
      if (orbitRef.current) orbitRef.current.enabled = false
      const target = event.target as EventTarget & {
        setPointerCapture?: (pointerId: number) => void
      }
      target.setPointerCapture?.(event.pointerId)
    }

    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(pending.plane, hit)) return

    updateRoom(
      room.id,
      movedTo(pending.startRoom, {
        x: hit.x - pending.offset.x,
        y: pending.startRoom.position.y,
        z: hit.z - pending.offset.z,
      }),
      { log: false },
    )
  }

  const finishPointerDrag = (event: ThreeEvent<PointerEvent>) => {
    const pending = pendingMoveRef.current
    if (!pending || pending.pointerId !== event.pointerId) return
    event.stopPropagation()

    const current = useCanvasStore
      .getState()
      .rooms.find((candidate) => candidate.id === room.id)
    if (current && pending.moving) {
      const cancelled = event.type === 'pointercancel'
      const moved =
        Math.abs(current.position.x - pending.startRoom.position.x) > 0.001 ||
        Math.abs(current.position.z - pending.startRoom.position.z) > 0.001
      if (moved && cancelled) {
        updateRoom(room.id, movedTo(pending.startRoom, pending.startRoom.position), { log: false })
      } else if (moved) {
        updateRoom(
          room.id,
          movedTo(pending.startRoom, current.position),
          {
            action: 'object.moved',
            previousValue: pending.startRoom,
            historySnapshot: pending.historySnapshot,
          },
        )
      }
    }

    const target = event.target as EventTarget & {
      releasePointerCapture?: (pointerId: number) => void
    }
    target.releasePointerCapture?.(event.pointerId)
    resetMoveState()
  }

  const mesh = (
    <mesh
      ref={meshRef}
      castShadow={!isPlanView && see === 1}
      receiveShadow
      position={[room.position.x, renderY, room.position.z]}
      raycast={wallPieces || ghost ? noRaycast : undefined}
      rotation={[
        THREE.MathUtils.degToRad(room.rotation.x),
        THREE.MathUtils.degToRad(room.rotation.y),
        THREE.MathUtils.degToRad(room.rotation.z),
      ]}
      onPointerDown={readOnly ? undefined : handlePointerDown}
      onPointerMove={readOnly ? undefined : handlePointerMove}
      onPointerUp={readOnly ? undefined : finishPointerDrag}
      onPointerCancel={readOnly ? undefined : finishPointerDrag}
      onPointerOver={
        plan
          ? (event) => {
              // Native tooltip for rooms too small to carry a Top-view label.
              event.stopPropagation()
              const world = roomWorldBounds(room)
              const { showName } = roomLabelLayout({
                label: room.label,
                w: world.w,
                d: world.d,
                pxPerMetre: camera.zoom,
                isSpace,
              })
              canvasElement.title = showName
                ? ''
                : `${room.label} — ${formatDims(world.w, world.d)} · ${formatArea(roomPlanArea(room))}`
            }
          : undefined
      }
      onPointerOut={(event) => {
        if (plan) canvasElement.title = ''
        if (!readOnly && pendingMoveRef.current?.pointerId === event.pointerId) event.stopPropagation()
      }}
    >
      {polygonSlab ? (
        <primitive object={polygonSlab} attach="geometry" />
      ) : (
        <boxGeometry args={[room.size.w, renderHeight, room.size.d]} />
      )}
      <meshStandardMaterial
        visible={!wallPieces && !modelFurniture}
        color={solid3d ? modelColor : displayRoomColor(room)}
        emissive={visual.emissive}
        emissiveIntensity={visual.emissiveIntensity}
        transparent={solid3d ? see < 1 : visual.opacity < 1}
        opacity={solid3d ? see : visual.opacity}
        depthWrite={solid3d ? see === 1 : visual.depthWrite}
        roughness={solid3d ? (isGlass ? 0.05 : 0.92) : visual.roughness}
        metalness={solid3d ? (isGlass ? 0.1 : 0) : visual.metalness}
      />
      {solid3d && !wallPieces && !modelFurniture && (
        <Edges color={edgeColor} transparent={ghost} opacity={ghost ? 0.3 : 1} />
      )}
      {wallPieces?.map((piece, index) => (
        <mesh key={index} position={piece.position} castShadow={!ghost} receiveShadow raycast={ghost ? noRaycast : undefined}>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial
            color={isSelected ? MODEL_COLORS.wallSelected : MODEL_COLORS.wall}
            roughness={0.95}
            transparent={ghost}
            opacity={see}
            depthWrite={!ghost}
          />
          <Edges color={MODEL_COLORS.edge} transparent={ghost} opacity={ghost ? 0.3 : 1} />
        </mesh>
      ))}
      {modelFurniture && (
        <>
          <mesh position={[0, room.size.h / 2 - 0.06, 0]} castShadow receiveShadow>
            <boxGeometry args={[room.size.w, Math.min(0.12, room.size.h), room.size.d]} />
            <meshStandardMaterial color={isSelected ? '#C08A6C' : '#8C6A55'} roughness={0.8} />
          </mesh>
          {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
            <mesh key={`${x}:${z}`} position={[x * room.size.w * 0.38, -0.06, z * room.size.d * 0.38]} castShadow>
              <boxGeometry args={[Math.min(0.07, room.size.w / 4), Math.max(0.05, room.size.h - 0.12), Math.min(0.07, room.size.d / 4)]} />
              <meshStandardMaterial color="#54575c" roughness={0.6} />
            </mesh>
          )))}
        </>
      )}
      {!solid3d && (isSelected || definition.category === 'space' || room.objectType === 'stair') && (
        <lineSegments>
          <primitive object={boxEdges} attach="geometry" />
          <lineBasicMaterial
            color={visual.edgeColor}
            transparent
            opacity={isSelected ? 1 : 0.82}
            linewidth={isSelected ? 2 : 1}
          />
        </lineSegments>
      )}
      {isSelected && (
        <lineSegments>
          <primitive object={selectionEdges} attach="geometry" />
          <lineBasicMaterial
            color={solid3d ? EDITOR_PALETTE.selection : '#ffffff'}
            transparent
            opacity={0.9}
            linewidth={2}
            depthTest={false}
          />
        </lineSegments>
      )}
    </mesh>
  )

  if (ghost) return mesh

  const shouldShowLabel = !plan && (modelStage ? isSelected : !isThinComponent || isSelected)
  const label = shouldShowLabel ? (
    <Html
      position={[room.position.x, room.position.y + room.size.h / 2 + 0.35, room.position.z]}
      center
      zIndexRange={[1, 0]}
      style={{ pointerEvents: 'none' }}
    >
      {/* One line per room keeps neighbouring small rooms' labels from
          stacking on each other; the area lives in the selection toolbar. */}
      <div
        className={`min-w-max whitespace-nowrap rounded-md border bg-graphite-800/90 px-2 py-0.5 shadow-md backdrop-blur ${
          invalid
            ? 'border-danger/70 text-danger ring-2 ring-danger/20'
            : isSelected
            ? 'border-ink text-ink ring-2 ring-ink/25'
            : 'border-ink/10 text-muted'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              invalid ? 'bg-danger' : isSelected ? 'bg-ink' : 'bg-graphite-400'
            }`}
          />
          {room.label}
        </div>
      </div>
    </Html>
  ) : null

  const dimensions =
    !plan && !modelStage && isDimensionable && (isSelected || (showDimensions && isPlanView)) ? (
      <DimensionAnnotations room={room} emphasized={isSelected} />
    ) : null

  return (
    <>
      {mesh}
      {!plan && !modelStage && isSelected && (isPlanView || room.objectType === 'room') && (
        <ResizeHandles
          room={room}
          orbitRef={orbitRef}
          readOnly={readOnly}
          viewMode={viewMode}
        />
      )}
      {label}
      {dimensions}
    </>
  )
}
