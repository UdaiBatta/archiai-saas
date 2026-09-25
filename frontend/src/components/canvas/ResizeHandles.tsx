import { useEffect, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { RefObject } from 'react'
import * as THREE from 'three'
import {
  type CanvasHistorySnapshot,
  type CanvasViewMode,
  type Room,
  useCanvasStore,
} from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { isPrimaryPointerButton } from '../../store/interactionModel'
import {
  CORNER_RESIZE_HANDLES,
  cornerHandlePosition,
  resizeRoomFromWorldCorner,
  type CornerResizeHandle,
} from './resizeHandleGeometry'
import { EDITOR_PALETTE } from './editorPalette'

interface OrbitHandle {
  enabled: boolean
}

interface ResizeHandlesProps {
  room: Room
  orbitRef: RefObject<OrbitHandle>
  readOnly?: boolean
  viewMode?: CanvasViewMode
}

interface ActiveResize {
  pointerId: number
  handle: CornerResizeHandle
  startRoom: Room
  historySnapshot: CanvasHistorySnapshot
  plane: THREE.Plane
}

function cloneRoomForResize(room: Room): Room {
  return {
    ...room,
    position: { ...room.position },
    size: { ...room.size },
    rotation: { ...room.rotation },
  }
}

export function ResizeHandles({
  room,
  orbitRef,
  readOnly = false,
  viewMode = '3d',
}: ResizeHandlesProps) {
  const activeResizeRef = useRef<ActiveResize | null>(null)
  const updateRoom = useCanvasStore((s) => s.updateRoom)
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode)
  const setPointerIntent = useCanvasStore((s) => s.setPointerIntent)
  const floors = useCanvasStore((s) => s.floors)
  const definition = COMPONENT_REGISTRY[room.objectType]
  const footprint = floors.find((floor) => floor.level === room.floorLevel)?.footprint

  useEffect(() => {
    if (readOnly) return
    const cancelInteraction = () => {
      const active = activeResizeRef.current
      if (active) {
        updateRoom(
          room.id,
          { size: active.startRoom.size, position: active.startRoom.position },
          { log: false },
        )
      }
      activeResizeRef.current = null
      if (orbitRef.current) orbitRef.current.enabled = true
      setInteractionMode('select')
      setPointerIntent('idle')
    }

    window.addEventListener('archiai:cancel-canvas-interaction', cancelInteraction)
    window.addEventListener('blur', cancelInteraction)
    window.addEventListener('lostpointercapture', cancelInteraction, true)
    return () => {
      window.removeEventListener('archiai:cancel-canvas-interaction', cancelInteraction)
      window.removeEventListener('blur', cancelInteraction)
      window.removeEventListener('lostpointercapture', cancelInteraction, true)
    }
  }, [readOnly, room.id, updateRoom, setInteractionMode, setPointerIntent, orbitRef])

  if (readOnly || !definition.canResize) return null

  const handlePointerDown =
    (handle: CornerResizeHandle) => (event: ThreeEvent<PointerEvent>) => {
      if (!isPrimaryPointerButton(event.button)) return
      event.stopPropagation()

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -room.position.y)
      const hit = new THREE.Vector3()
      if (!event.ray.intersectPlane(plane, hit)) return

      activeResizeRef.current = {
        pointerId: event.pointerId,
        handle,
        startRoom: cloneRoomForResize(room),
        historySnapshot: useCanvasStore.getState().createHistorySnapshot(),
        plane,
      }
      if (orbitRef.current) orbitRef.current.enabled = false
      setInteractionMode('resize')
      setPointerIntent('resizing')
      const target = event.target as EventTarget & {
        setPointerCapture?: (pointerId: number) => void
      }
      target.setPointerCapture?.(event.pointerId)
    }

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const active = activeResizeRef.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()

    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(active.plane, hit)) return

    const state = useCanvasStore.getState()
    const { size, position } = resizeRoomFromWorldCorner({
      room: active.startRoom,
      handle: active.handle,
      point: { x: hit.x, z: hit.z },
      snapToGrid: state.snapToGrid,
      gridSize: state.gridSize,
      footprint,
    })

    updateRoom(room.id, { size, position }, { log: false })
  }

  const finishResize = (event: ThreeEvent<PointerEvent>) => {
    const active = activeResizeRef.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (orbitRef.current) orbitRef.current.enabled = true

    const current = useCanvasStore.getState().rooms.find((candidate) => candidate.id === room.id)
    if (current) {
      const cancelled = event.type === 'pointercancel'
      const changed =
        Math.abs(current.size.w - active.startRoom.size.w) > 0.001 ||
        Math.abs(current.size.h - active.startRoom.size.h) > 0.001 ||
        Math.abs(current.size.d - active.startRoom.size.d) > 0.001 ||
        Math.abs(current.position.x - active.startRoom.position.x) > 0.001 ||
        Math.abs(current.position.z - active.startRoom.position.z) > 0.001
      if (changed && cancelled) {
        updateRoom(
          room.id,
          { size: active.startRoom.size, position: active.startRoom.position },
          { log: false },
        )
      } else if (changed) {
        updateRoom(
          room.id,
          { size: current.size, position: current.position },
          {
            action: 'object.resized',
            previousValue: active.startRoom,
            historySnapshot: active.historySnapshot,
          },
        )
      }
    }

    const target = event.target as EventTarget & {
      releasePointerCapture?: (pointerId: number) => void
    }
    activeResizeRef.current = null
    target.releasePointerCapture?.(event.pointerId)
    setInteractionMode('select')
    setPointerIntent('idle')
  }

  const handleSize = Math.max(
    0.3,
    Math.min(0.5, Math.max(room.size.w, room.size.d) * 0.08),
  )
  const y = room.position.y + room.size.h / 2 + 0.08
  const is3d = viewMode === '3d'

  return (
    <group>
      {CORNER_RESIZE_HANDLES.map((handle) => {
        const position = cornerHandlePosition(room, handle)
        const handleHeight = is3d ? Math.max(0.14, handleSize * 0.42) : 0.08
        return (
          <mesh
            key={handle.key}
            name={`resize-handle-${room.id}-${handle.key}`}
            position={[position.x, y, position.z]}
            renderOrder={20}
            onPointerDown={handlePointerDown(handle)}
            onPointerMove={handlePointerMove}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
          >
            <boxGeometry args={[handleSize, handleHeight, handleSize]} />
            <meshStandardMaterial
              color={EDITOR_PALETTE.selection}
              emissive={EDITOR_PALETTE.selection}
              emissiveIntensity={is3d ? 0.55 : 0.25}
              depthTest={false}
            />
            <lineSegments raycast={() => null}>
              <edgesGeometry
                args={[new THREE.BoxGeometry(handleSize, handleHeight, handleSize)]}
              />
              <lineBasicMaterial color="#ffffff" depthTest={false} />
            </lineSegments>
          </mesh>
        )
      })}
    </group>
  )
}
