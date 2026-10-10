import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { create } from 'zustand'
import { useCanvasStore, type CanvasObjectType } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { EDITOR_PALETTE } from './editorPalette'

/** True while an object is being dragged from a button onto the canvas. */
export const usePlacementDrag = create<{ dragging: boolean; setDragging: (on: boolean) => void }>((set) => ({
  dragging: false,
  setDragging: (dragging) => set({ dragging }),
}))

/**
 * Props for a button that both arms placement on click and lets the user drag
 * the object straight onto the canvas: leaving the button with the mouse
 * held starts a drag, and releasing over the canvas drops it there.
 */
export function dragToPlace(type: CanvasObjectType, onStart?: () => void) {
  let pressed = false
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      pressed = event.button === 0
    },
    onPointerUp: () => {
      pressed = false
    },
    onPointerLeave: (event: ReactPointerEvent) => {
      if (!pressed || (event.buttons & 1) === 0) return
      pressed = false
      onStart?.()
      useCanvasStore.getState().setPlacementMode(type)
      usePlacementDrag.getState().setDragging(true)
    },
  }
}

/**
 * While a placement tool is armed, a translucent copy of the object follows
 * the pointer over the active floor, so the user sees where it will land.
 * Ends a drag-to-place: release over the canvas places it, anywhere else
 * cancels.
 */
export function PlacementGhost() {
  const mode = useCanvasStore((s) => s.placementMode)
  const elevation = useCanvasStore((s) => {
    const level = s.selectedFloor === 'all' ? 0 : s.selectedFloor
    return (s.floors.find((floor) => floor.level === level) ?? s.floors[0])?.elevation ?? 0
  })
  const { gl, camera, raycaster, invalidate } = useThree()
  const [point, setPoint] = useState<{ x: number; z: number } | null>(null)

  useEffect(() => {
    if (!mode) {
      setPoint(null)
      return
    }
    const canvas = gl.domElement
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation)
    const pointAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      if (!inside) return null
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.ray.intersectPlane(floor, new THREE.Vector3())
      return hit ? { x: hit.x, z: hit.z } : null
    }
    const onMove = (event: PointerEvent) => {
      setPoint(pointAt(event))
      invalidate()
    }
    const onUp = (event: PointerEvent) => {
      const drag = usePlacementDrag.getState()
      if (!drag.dragging) return
      drag.setDragging(false)
      const state = useCanvasStore.getState()
      const at = event.target === canvas ? pointAt(event) : null
      if (at && state.placementMode) state.addObjectAt(state.placementMode, at.x, at.z)
      else state.setPlacementMode(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [mode, elevation, gl, camera, raycaster, invalidate])

  if (!mode || !point) return null
  const { w, h, d } = COMPONENT_REGISTRY[mode].defaultSize
  return (
    <mesh position={[point.x, elevation + h / 2, point.z]} raycast={() => null} renderOrder={5}>
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial color={EDITOR_PALETTE.selection} transparent opacity={0.28} depthWrite={false} />
      <Edges color={EDITOR_PALETTE.selection} />
    </mesh>
  )
}
