import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { progressAt, swingFrame, useViewTransition, type CameraPose } from './viewTransition'

/**
 * Flies the canvas's own perspective camera from one view to the other for
 * the length of a 3D <-> Top transition (see swingFrame), so even the
 * orthographic Axo and Top views are reached through a moving, tipping
 * perspective. Scene leaves the orthographic camera out meanwhile, which makes
 * the perspective one the default; its lens is put back when the flight ends.
 * (A camera of its own would be remembered by the orthographic camera as the
 * one to hand back to, and Persp would later open through its long lens.)
 */
export function SwingCamera({ from, to, startedAt }: { from: CameraPose; to: CameraPose; startedAt: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const get = useThree((s) => s.get)
  const end = useViewTransition((s) => s.end)
  const lens = useRef<{ camera: THREE.PerspectiveCamera; fov: number; near: number; far: number } | null>(null)

  const fly = (camera: THREE.Camera, size: { width: number; height: number }) => {
    const perspective = camera as THREE.PerspectiveCamera
    if (!perspective.isPerspectiveCamera) return null
    lens.current ??= { camera: perspective, fov: perspective.fov, near: perspective.near, far: perspective.far }
    const t = progressAt(startedAt, performance.now())
    const frame = swingFrame(from, to, t)
    perspective.fov = frame.fov
    // The landing framing can briefly give this camera an orthographic zoom
    // (it is still the default for that one render); a lens has none.
    perspective.zoom = 1
    perspective.near = frame.near
    perspective.far = frame.far
    perspective.aspect = size.width / Math.max(size.height, 1)
    perspective.position.copy(frame.position)
    perspective.quaternion.copy(frame.quaternion)
    perspective.updateProjectionMatrix()
    return t
  }

  // Placed before the first frame is drawn: by now the orthographic camera
  // has handed back to the perspective one.
  useLayoutEffect(() => {
    const state = get()
    fly(state.camera, state.size)
    invalidate()
    return () => {
      const saved = lens.current
      if (saved) {
        saved.camera.fov = saved.fov
        saved.camera.near = saved.near
        saved.camera.far = saved.far
        saved.camera.updateProjectionMatrix()
      }
      const controls = get().controls as { enabled: boolean } | null
      if (controls) controls.enabled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per flight
  }, [])

  // Before OrbitControls (priority -1), which must not steer mid-flight. The
  // live controls come from the store: switching camera makes drei build new
  // ones, which a ref taken earlier would miss.
  useFrame(({ camera, size, controls }) => {
    if (controls) (controls as unknown as { enabled: boolean }).enabled = false
    const t = fly(camera, size)
    if (t !== null && t >= 1) end()
    else invalidate()
  }, -2)

  return null
}
