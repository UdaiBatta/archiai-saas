import { create } from 'zustand'

/**
 * The 3D <-> Top switch as one short animation: the camera swings between the
 * two views while the rooms burst apart from the building's centre and settle
 * back in place. Skipped when the viewer asks for reduced motion.
 */
export const TRANSITION_MS = 950

interface ViewTransitionState {
  /** performance.now() when the running transition began, else null. */
  startedAt: number | null
  start: () => void
  end: () => void
}

export const useViewTransition = create<ViewTransitionState>((set) => ({
  startedAt: null,
  start: () => {
    if (!prefersReducedMotion()) set({ startedAt: performance.now() })
  },
  end: () => set({ startedAt: null }),
}))

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Clamped 0..1 progress of a transition that began at `startedAt`. */
export const progressAt = (startedAt: number, now: number) => Math.min(1, Math.max(0, (now - startedAt) / TRANSITION_MS))

/**
 * Where a room sits at progress `t`: pushed out from the building centre and
 * lifted, most at mid-flight and back home at both ends. Rooms further out go
 * further, and each one lags a little by its distance, so the burst ripples.
 */
export function explodeOffset(
  room: { x: number; z: number },
  center: { x: number; z: number },
  span: number,
  t: number,
): [number, number, number] {
  const dx = room.x - center.x
  const dz = room.z - center.z
  const reach = Math.hypot(dx, dz)
  const share = span > 0 ? Math.min(1, reach / (span / 2)) : 0
  // A ripple: outer rooms start a touch later, all land together at t = 1.
  const lag = 0.18 * share
  const local = Math.min(1, Math.max(0, (t - lag) / (1 - lag)))
  const burst = Math.sin(Math.PI * local)
  const push = burst * span * 0.22 * (0.35 + share)
  const nx = reach > 1e-6 ? dx / reach : 0
  const nz = reach > 1e-6 ? dz / reach : 0
  return [nx * push, burst * (1.2 + span * 0.08 * (1 - share * 0.5)), nz * push]
}
