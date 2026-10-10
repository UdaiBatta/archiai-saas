import { useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useCanvasStore, type Room } from '../../store/canvasStore'
import { isEngineWall } from '../../store/componentRegistry'
import { wallRun } from '../../store/wallLines'

/** Wall moves snap to 5 cm. */
const STEP = 0.05

interface WallDrag {
  pointerId: number
  base: Room[]
  axis: 'x' | 'z'
  start: number
  plane: THREE.Plane
  historySnapshot: ReturnType<ReturnType<typeof useCanvasStore.getState>['createHistorySnapshot']>
  delta: number
}

/**
 * Dragging a selected engine wall moves its whole wall line (see
 * store/wallLines.ts): the rooms on both sides resize, then the walls
 * rebuild. Each handler returns true when it handled the event.
 */
export function useWallLineDrag(room: Room, orbitRef: MutableRefObject<{ enabled: boolean } | null>) {
  const drag = useRef<WallDrag | null>(null)

  const end = () => {
    drag.current = null
    useCanvasStore.getState().setPointerIntent('idle')
    if (orbitRef.current) orbitRef.current.enabled = true
  }

  const onPointerDown = (event: ThreeEvent<PointerEvent>, isSelected: boolean) => {
    if (!isSelected || !isEngineWall(room)) return false
    const state = useCanvasStore.getState()
    const run = wallRun(state.rooms, room.id)
    if (!run || run.edges.length === 0) return false
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -room.position.y)
    const hit = event.ray.intersectPlane(plane, new THREE.Vector3())
    if (!hit) return false
    event.stopPropagation()
    drag.current = {
      pointerId: event.pointerId,
      base: state.rooms,
      axis: run.axis,
      start: hit[run.axis],
      plane,
      historySnapshot: state.createHistorySnapshot(),
      delta: 0,
    }
    state.setPointerIntent('moving')
    if (orbitRef.current) orbitRef.current.enabled = false
    ;(event.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId)
    return true
  }

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return false
    event.stopPropagation()
    const hit = event.ray.intersectPlane(current.plane, new THREE.Vector3())
    if (!hit) return true
    const delta = Math.round((hit[current.axis] - current.start) / STEP) * STEP
    if (delta !== current.delta) {
      current.delta = delta
      useCanvasStore.getState().moveWallLine(room.id, delta, { base: current.base })
    }
    return true
  }

  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return false
    event.stopPropagation()
    const cancelled = event.type === 'pointercancel'
    useCanvasStore.getState().moveWallLine(room.id, cancelled ? 0 : current.delta, {
      base: current.base,
      commit: !cancelled && current.delta !== 0,
      historySnapshot: current.historySnapshot,
    })
    ;(event.target as Element & { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId)
    end()
    return true
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}
