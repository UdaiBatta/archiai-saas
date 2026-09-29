import { useEffect, type RefObject } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useThree } from '@react-three/fiber'
import { StatsGl } from '@react-three/drei'

interface Dispatcher {
  addEventListener: (type: 'change', listener: () => void) => void
  removeEventListener: (type: 'change', listener: () => void) => void
}

/** While the camera moves or an object is edited: skip a post pass (the AO,
 * about a third of the frame), freeze the sun's shadow map (it depends on the
 * sun and model, not the camera, so orbiting never needs it redrawn), and let
 * the canvas drop resolution (<AdaptiveDpr>). One sharp, fully shaded frame is
 * drawn once things settle. */
export function PauseWhileMoving({ pass, idleMs = 160 }: { pass: RefObject<{ enabled: boolean }>; idleMs?: number }) {
  const controls = useThree((s) => s.controls) as unknown as Dispatcher | null
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const regress = useThree((s) => s.performance.regress)
  useEffect(() => {
    if (!controls) return
    let timer = 0
    const setEnabled = (on: boolean) => {
      if (pass.current) pass.current.enabled = on
    }
    const settle = () => {
      setEnabled(true)
      gl.shadowMap.autoUpdate = true
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
    const onChange = () => {
      setEnabled(false)
      gl.shadowMap.autoUpdate = false
      regress()
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, idleMs)
    }
    controls.addEventListener('change', onChange)
    // Dragging a room or mass re-renders every frame too: pause AO for edits,
    // not just for camera moves.
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.rooms !== prev.rooms || state.layoutMetadata !== prev.layoutMetadata) onChange()
    })
    return () => {
      unsubscribe()
      controls.removeEventListener('change', onChange)
      window.clearTimeout(timer)
      settle()
    }
  }, [controls, pass, invalidate, idleMs, gl, regress])
  return null
}

/** Dev-only fps/CPU/GPU readout: add `?perf` to the URL. */
export const SHOW_PERF = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')

export function PerfReadout() {
  return <StatsGl className="!fixed !bottom-2 !right-2 !left-auto !top-auto z-50" />
}
