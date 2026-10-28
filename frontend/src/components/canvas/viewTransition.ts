import * as THREE from 'three'
import { create } from 'zustand'

/**
 * The 3D <-> Top switch as one continuous shot: the rooms lift and drift
 * apart from the building's centre, the camera swings round over the top
 * with its perspective opening up on the way, and everything settles back as
 * the camera lands in the plan (or back in 3D). Skipped under reduced motion.
 */
export const TRANSITION_MS = 1800

interface ViewTransitionState {
  /** performance.now() when the running transition began, else null. */
  startedAt: number | null
  start: () => void
  end: () => void
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

export const useViewTransition = create<ViewTransitionState>((set) => ({
  startedAt: null,
  start: () => {
    if (!prefersReducedMotion()) set({ startedAt: performance.now() })
  },
  end: () => set({ startedAt: null }),
}))

/** Clamped 0..1 progress of a transition that began at `startedAt`. */
export const progressAt = (startedAt: number, now: number) => Math.min(1, Math.max(0, (now - startedAt) / TRANSITION_MS))

/** Zero slope at both ends: no jolt as a move starts or lands. */
export const smoother = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}
export const easeInOut = smoother

/** How far apart the rooms are: out over the first third, held while the
 * camera swings, home over the last third. */
export const burstAmount = (t: number) => smoother(t / 0.34) * (1 - smoother((t - 0.66) / 0.34))

/**
 * Where a room sits at progress `t`: pushed out from the building centre and
 * lifted. Rooms further out go further and lead slightly, so the burst
 * ripples outwards and lands from the outside in.
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
  const lag = 0.06 * (1 - share)
  const burst = burstAmount(Math.min(1, Math.max(0, (t - lag) / (1 - lag))))
  const push = burst * span * 0.16 * (0.3 + share)
  const nx = reach > 1e-6 ? dx / reach : 0
  const nz = reach > 1e-6 ? dz / reach : 0
  return [nx * push, burst * (0.8 + span * 0.06 * (1.2 - share)), nz * push]
}

/** A camera as the swing sees it: where it looks, from which direction, how
 * much of the world fits vertically at that point, and its field of view
 * (null = orthographic). */
export interface CameraPose {
  target: THREE.Vector3
  direction: THREE.Vector3
  height: number
  fov: number | null
}

/** An orthographic end of the swing is flown as a very long lens, which
 * looks the same, so the cut to the real camera at either end is invisible. */
const LONG_LENS_DEG = 5
/** How much wider the lens opens mid-swing: the plan "tips up" in perspective. */
const SWING_OPEN_DEG = 34

export function poseOf(camera: THREE.Camera, target: THREE.Vector3, viewportHeight: number): CameraPose {
  const offset = camera.position.clone().sub(target)
  const distance = Math.max(offset.length(), 1e-3)
  const perspective = camera as THREE.PerspectiveCamera
  const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true
  return {
    target: target.clone(),
    direction: offset.divideScalar(distance),
    height: ortho
      ? viewportHeight / Math.max((camera as THREE.OrthographicCamera).zoom, 1e-3)
      : 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2),
    fov: ortho ? null : perspective.fov,
  }
}

/** The pose of a framed view (presetView); `fov` null for orthographic. */
export function poseOfView(
  view: { position: [number, number, number]; target: [number, number, number]; zoom: number },
  fov: number | null,
  viewportHeight: number,
): CameraPose {
  const target = new THREE.Vector3(...view.target)
  const offset = new THREE.Vector3(...view.position).sub(target)
  const distance = Math.max(offset.length(), 1e-3)
  return {
    target,
    direction: offset.divideScalar(distance),
    height: fov === null ? viewportHeight / Math.max(view.zoom, 1e-3) : 2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2),
    fov,
  }
}

export interface SwingFrame {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  fov: number
  near: number
  far: number
}

const UP = new THREE.Vector3(0, 1, 0)
/** How a camera at `pose` is turned (looking at the target, world up). */
const orientation = (pose: CameraPose) =>
  new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.direction, new THREE.Vector3(), UP))

/** The camera at progress `t` between two poses. Its whole orientation is
 * interpolated, roll included, so it arrives over the plan already turned
 * north-up rather than spinning into place at the end. */
export function swingFrame(from: CameraPose, to: CameraPose, t: number): SwingFrame {
  const k = smoother(t)
  const target = from.target.clone().lerp(to.target, k)
  const quaternion = orientation(from).slerp(orientation(to), k)
  // A camera looks down its local -z: it sits along +z from the target.
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion)
  const fov = THREE.MathUtils.lerp(from.fov ?? LONG_LENS_DEG, to.fov ?? LONG_LENS_DEG, k) + SWING_OPEN_DEG * Math.sin(Math.PI * k)
  // Pull back a little mid-swing so the burst stays in frame.
  const height = Math.exp(THREE.MathUtils.lerp(Math.log(from.height), Math.log(to.height), k)) * (1 + 0.32 * burstAmount(t))
  const distance = height / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  return {
    position: target.clone().addScaledVector(back, distance),
    quaternion,
    fov,
    near: Math.max(0.05, distance * 0.02),
    far: distance * 40,
  }
}
