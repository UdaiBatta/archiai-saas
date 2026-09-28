import { useEffect, type RefObject } from 'react'
import { useCanvasStore } from '../../store/canvasStore'
import { useThree } from '@react-three/fiber'
import { StatsGl } from '@react-three/drei'

interface Dispatcher {
  addEventListener: (type: 'change', listener: () => void) => void
  removeEventListener: (type: 'change', listener: () => void) => void
}

/** Skip a post pass (the AO) while the camera moves, where it costs about a
 * third of the frame; it comes back on a fresh frame once the camera settles. */
export function PauseWhileMoving({ pass, idleMs = 160 }: { pass: RefObject<{ enabled: boolean }>; idleMs?: number }) {
  const controls = useThree((s) => s.controls) as unknown as Dispatcher | null
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!controls) return
    let timer = 0
    const setEnabled = (on: boolean) => {
      if (pass.current) pass.current.enabled = on
    }
    const onChange = () => {
      setEnabled(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        setEnabled(true)
        invalidate()
      }, idleMs)
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
      setEnabled(true)
    }
  }, [controls, pass, invalidate, idleMs])
  return null
}

/** Dev-only fps/CPU/GPU readout: add `?perf` to the URL. */
export const SHOW_PERF = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')

export function PerfReadout() {
  return <StatsGl className="!fixed !bottom-2 !right-2 !left-auto !top-auto z-50" />
}
