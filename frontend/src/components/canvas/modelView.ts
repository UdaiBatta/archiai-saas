/**
 * Pure camera/lighting/material math for the 3D model view, kept out of the
 * R3F components so it can be tested without WebGL.
 *
 * World axes follow the sun model: x = east, z = south, y = up.
 */
export type CameraPreset = 'perspective' | 'axo' | 'top'

export const CAMERA_PRESETS: { value: CameraPreset; label: string }[] = [
  { value: 'perspective', label: 'Persp' },
  { value: 'axo', label: 'Axo' },
  { value: 'top', label: 'Top' },
]

/** Plan rectangle (min corner + size) and the height of the building on it. */
export interface SiteBounds {
  x: number
  z: number
  w: number
  d: number
  h: number
}

export interface Viewport {
  width: number
  height: number
}

export interface CameraView {
  position: [number, number, number]
  target: [number, number, number]
  /** Orthographic zoom (pixels per metre); 1 for the perspective camera. */
  zoom: number
}

type Vec3 = [number, number, number]

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Direction from the target toward the camera. Axo is a true isometric
 * from the south-east; top keeps a hair of +z so north stays screen-up. */
const PRESET_DIRECTION: Record<CameraPreset, Vec3> = {
  perspective: normalize([0.8, 1, 0.8]),
  axo: normalize([1, 1, 1]),
  top: [0, 1, 0],
}

/** Screen right/up axes for an orthographic camera looking back along `dir`. */
export function screenAxes(dir: Vec3): { right: Vec3; up: Vec3 } {
  if (Math.abs(dir[1]) > 0.999) return { right: [1, 0, 0], up: [0, 0, -1] } // north up
  const right = normalize(cross([0, 1, 0], dir))
  return { right, up: cross(dir, right) }
}

/** Orthographic zoom that fits the whole site box on screen with a margin. */
export function fitOrthoZoom(bounds: SiteBounds, dir: Vec3, viewport: Viewport, margin = 0.82): number {
  const { right, up } = screenAxes(dir)
  let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity
  for (const x of [bounds.x, bounds.x + bounds.w]) {
    for (const y of [0, bounds.h]) {
      for (const z of [bounds.z, bounds.z + bounds.d]) {
        const r = dot([x, y, z], right)
        const u = dot([x, y, z], up)
        minR = Math.min(minR, r); maxR = Math.max(maxR, r)
        minU = Math.min(minU, u); maxU = Math.max(maxU, u)
      }
    }
  }
  const spanR = Math.max(maxR - minR, 1)
  const spanU = Math.max(maxU - minU, 1)
  return margin * Math.min(viewport.width / spanR, viewport.height / spanU)
}

/** Where the camera goes for a preset, framing the whole site. */
export function presetView(preset: CameraPreset, bounds: SiteBounds, viewport: Viewport, elevation = 0): CameraView {
  const target: Vec3 = [bounds.x + bounds.w / 2, elevation, bounds.z + bounds.d / 2]
  const dir = PRESET_DIRECTION[preset]
  if (preset === 'perspective') {
    // Same framing the editor always had: back off with the site size, more
    // on portrait viewports so the model is not clipped at the sides.
    const portraitScale = Math.max(1, (0.95 * viewport.height) / Math.max(viewport.width, 1))
    const distance = Math.max(bounds.w, bounds.d, 8) * 1.15 * portraitScale
    return {
      position: [target[0] + 0.8 * distance, target[1] + distance, target[2] + 0.8 * distance],
      target,
      zoom: 1,
    }
  }
  // Orthographic: distance only has to clear the model; zoom does the framing.
  const distance = Math.max(bounds.w, bounds.d, bounds.h, 10) * 3
  return {
    position: [
      target[0] + dir[0] * distance,
      target[1] + dir[1] * distance,
      target[2] + dir[2] * distance + (preset === 'top' ? 0.001 : 0),
    ],
    target,
    zoom: fitOrthoZoom(bounds, dir, viewport),
  }
}

/** A directional-light shadow frustum that just covers the site: the ortho
 * shadow camera is centred on the ground centre, so its half-size is the
 * distance from there to the farthest top corner. Tight = sharper shadows. */
export function shadowFrustum(bounds: SiteBounds) {
  const radius = Math.hypot(bounds.w / 2, bounds.d / 2, bounds.h) + 1
  const distance = radius * 2
  // Far reaches well past the site: low sun throws long shadows along the
  // light's depth axis, and ground beyond `far` would read as lit.
  return { radius, distance, near: Math.max(0.5, distance - radius * 1.5), far: distance + radius * 6 }
}

const toRgb = (hex: string) => {
  const value = parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** Blend `hex` toward `toward` by t (0 = hex, 1 = toward). */
export function mixHex(hex: string, toward: string, t: number): string {
  const a = toRgb(hex)
  const b = toRgb(toward)
  return `#${a.map((channel, i) => Math.round(channel + (b[i] - channel) * t).toString(16).padStart(2, '0')).join('')}`
}

/** White-model palette. */
export const MODEL_COLORS = {
  wall: '#f4f3ef',
  wallSelected: '#f6d9cf',
  floorBase: '#f1efea',
  edge: '#3a3936',
  floorEdge: '#9a968e',
  glass: '#9cc4de',
  ground: '#e6e7e7',
  plot: '#f6f6f4',
  plotLine: '#2f2e2b',
  slab: '#e6e4de',
  gridCell: '#cfcdc6',
  gridSection: '#b5b2aa',
  sky: '#eceef0',
  /** Hard-violation rooms: outline, label and floor tint. */
  invalid: '#c4553f',
} as const

/** A room floor keeps its colour identity as a pale, desaturated tint. */
export const floorTint = (roomColor: string) => mixHex(roomColor, MODEL_COLORS.floorBase, 0.8)

/** How a floor renders relative to the active one. */
export function floorDisplay(level: number, selected: number | 'all', ghostOthers: boolean): 'active' | 'ghost' | 'hidden' {
  if (selected === 'all' || level === selected) return 'active'
  return ghostOthers ? 'ghost' : 'hidden'
}
