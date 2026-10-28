import { useRef, type RefObject } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { type CanvasHistorySnapshot, type Room, useCanvasStore, workArea } from '../../store/canvasStore'
import { isPrimaryPointerButton } from '../../store/interactionModel'
import { MAX_ROOM_POINTS, MIN_ROOM_POINTS, roomOutline, type OutlinePoint } from '../../store/roomOutline'
import { HANDLE_PX, HandleMark, useHandleMetres } from './HandleMark'

interface ShapeDrag {
  pointerId: number
  index: number
  start: OutlinePoint[]
  startRoom: Room
  historySnapshot: CanvasHistorySnapshot
  plane: THREE.Plane
}

/**
 * Reshape a selected room: drag a point to move it, drag an edge's midpoint
 * to add a point there (up to MAX_ROOM_POINTS), double-click a point to remove
 * it. A box room shows only the midpoints; its corners are the resize handles.
 * The same grips in Top, Axo and Persp.
 */
export function ShapeHandles({ room, orbitRef, y }: { room: Room; orbitRef: RefObject<{ enabled: boolean }>; y: number }) {
  const metres = useHandleMetres()
  const canvas = useThree((s) => s.gl.domElement)
  const dragRef = useRef<ShapeDrag | null>(null)
  const setRoomOutline = useCanvasStore((s) => s.setRoomOutline)
  const setInteractionMode = useCanvasStore((s) => s.setInteractionMode)
  const setPointerIntent = useCanvasStore((s) => s.setPointerIntent)
  const outline = roomOutline(room)
  const shaped = !!room.polygonVertices
  const canAdd = outline.length < MAX_ROOM_POINTS

  const begin = (event: ThreeEvent<PointerEvent>, index: number, points: OutlinePoint[]) => {
    if (!isPrimaryPointerButton(event.button)) return
    event.stopPropagation()
    dragRef.current = {
      pointerId: event.pointerId,
      index,
      start: points,
      startRoom: { ...room, position: { ...room.position }, size: { ...room.size } },
      historySnapshot: useCanvasStore.getState().createHistorySnapshot(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -room.position.y),
    }
    if (orbitRef.current) orbitRef.current.enabled = false
    setInteractionMode('resize')
    setPointerIntent('resizing')
    ;(event.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId)
  }

  const move = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(drag.plane, hit)) return
    const state = useCanvasStore.getState()
    const snap = (v: number) => (state.snapToGrid && state.gridSize > 0 ? Math.round(v / state.gridSize) * state.gridSize : v)
    const area = workArea(state.floors.find((f) => f.level === (room.floorLevel ?? 0))?.footprint)
    const clamp = (v: number, lo?: number, span?: number) => (lo === undefined || span === undefined ? v : Math.min(lo + span, Math.max(lo, v)))
    const point = { x: clamp(snap(hit.x), area?.x, area?.w), z: clamp(snap(hit.z), area?.z, area?.d) }
    // An invalid shape (crossing edges) is refused by the store, so the
    // point simply stays at its last good place.
    setRoomOutline(room.id, drag.start.map((p, i) => (i === drag.index ? point : p)), { log: false })
  }

  const finish = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    dragRef.current = null
    if (orbitRef.current) orbitRef.current.enabled = true
    setInteractionMode('select')
    setPointerIntent('idle')
    ;(event.target as Element & { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId)
    const current = useCanvasStore.getState().rooms.find((r) => r.id === room.id)
    if (!current) return
    const options = { previousValue: drag.startRoom, historySnapshot: drag.historySnapshot }
    if (event.type === 'pointercancel') {
      setRoomOutline(room.id, roomOutline(drag.startRoom), { log: false })
    } else if (JSON.stringify(roomOutline(current)) !== JSON.stringify(roomOutline(drag.startRoom))) {
      setRoomOutline(room.id, roomOutline(current), { ...options, commit: true })
    }
  }

  const remove = (index: number) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (outline.length <= MIN_ROOM_POINTS) return
    setRoomOutline(room.id, outline.filter((_, i) => i !== index), { commit: true })
  }

  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: finish }

  const cursor = (value: string) => ({
    onPointerOver: () => { canvas.style.cursor = value },
    onPointerOut: () => { canvas.style.cursor = '' },
  })

  return (
    <group>
      {canAdd && outline.map((p, i) => {
        const q = outline[(i + 1) % outline.length]
        const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
        return (
          <HandleMark
            key={`m${i}`}
            name={`shape-midpoint-${room.id}-${i}`}
            position={[mid.x, y, mid.z]}
            size={metres(HANDLE_PX.midpoint)}
            round
            faint
            onPointerDown={(event) => begin(event, i + 1, [...outline.slice(0, i + 1), mid, ...outline.slice(i + 1)])}
            {...handlers}
            {...cursor('copy')}
          />
        )
      })}
      {shaped && outline.map((p, i) => (
        <HandleMark
          key={`v${i}`}
          name={`shape-point-${room.id}-${i}`}
          position={[p.x, y + 0.01, p.z]}
          size={metres(HANDLE_PX.point)}
          round
          onPointerDown={(event) => begin(event, i, outline)}
          onDoubleClick={remove(i)}
          {...handlers}
          {...cursor('move')}
        />
      ))}
    </group>
  )
}
