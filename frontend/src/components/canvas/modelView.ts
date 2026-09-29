/**
 * Pure camera/lighting/material math for the 3D model view, kept out of the
 * R3F components so it can be tested without WebGL.
 *
 * World axes follow the sun model: x = east, z = south, y = up.
 */
export type CameraPreset = 'perspective' | 'axo' | 'top'

/** Vertical field of view of the 3D view's perspective camera (Canvas3D). */
export const PERSPECTIVE_FOV = 50

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
export function fitOrthoZoom(bounds: SiteBounds, dir: Vec3, viewport: Viewport, margin = 0.62): number {
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
/** Screen space covered by editor chrome (top bar, dock, status bar), px. */
export interface ScreenInsets {
  top: number
  bottom: number
}

export function presetView(
  preset: CameraPreset,
  bounds: SiteBounds,
  fullViewport: Viewport,
  elevation = 0,
  insets: ScreenInsets = { top: 0, bottom: 0 },
): CameraView {
  // Fit into the part of the canvas the chrome leaves clear.
  const viewport = { width: fullViewport.width, height: Math.max(fullViewport.height - insets.top - insets.bottom, 1) }
  const target: Vec3 = [bounds.x + bounds.w / 2, elevation, bounds.z + bounds.d / 2]
  const dir = PRESET_DIRECTION[preset]
  if (preset === 'perspective') {
    // Back off with the site size (or a tall mass), more
    // on portrait viewports so the model is not clipped at the sides.
    const portraitScale = Math.max(1, (0.95 * viewport.height) / Math.max(viewport.width, 1))
    // Back off further when chrome covers part of the canvas, then aim a little
    // below the model so it sits in the middle of the clear area.
    const chromeScale = fullViewport.height / viewport.height
    const distance = Math.max(bounds.w, bounds.d, bounds.h * 1.4, 8) * 1.15 * portraitScale * chromeScale
    const offset = Math.hypot(0.8, 1, 0.8) * distance
    const worldPerPx = (2 * offset * Math.tan((PERSPECTIVE_FOV / 2) * Math.PI / 180)) / fullViewport.height
    const { up } = screenAxes(PRESET_DIRECTION.perspective)
    const shift = ((insets.bottom - insets.top) / 2) * worldPerPx
    const aim: Vec3 = [target[0] - up[0] * shift, target[1] - up[1] * shift, target[2] - up[2] * shift]
    return {
      position: [aim[0] + 0.8 * distance, aim[1] + distance, aim[2] + 0.8 * distance],
      target: aim,
      zoom: 1,
    }
  }
  // Orthographic: distance only has to clear the model; zoom does the framing.
  // Axo aims at the middle of the box, not its floor: the zoom fit assumes the
  // box is centred on screen, and a model rising off its target clips at the top.
  if (preset === 'axo') target[1] = elevation + bounds.h / 2
  const distance = Math.max(bounds.w, bounds.d, bounds.h, 10) * 3
  const zoom = fitOrthoZoom(bounds, dir, viewport)
  // Centre the model in the clear area, not the whole canvas: move the view
  // down by half the inset imbalance so the model sits higher on screen.
  const { up } = screenAxes(dir)
  const shift = (insets.bottom - insets.top) / 2 / zoom
  const aim: Vec3 = [target[0] - up[0] * shift, target[1] - up[1] * shift, target[2] - up[2] * shift]
  return {
    position: [
      aim[0] + dir[0] * distance,
      aim[1] + dir[1] * distance,
      aim[2] + dir[2] * distance + (preset === 'top' ? 0.001 : 0),
    ],
    target: aim,
    zoom,
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

/** The box the camera and sun must cover: the plot, the site boundary and
 * every mass (with its top), whichever reach furthest. */
export function sceneExtent(
  plot: { x: number; z: number; w: number; d: number },
  buildingTop: number,
  site: { boundary: { x: number; z: number }[] } | null,
  masses: { footprint: { x: number; z: number }[]; baseM: number; floors: number; floorHeightM: number }[],
): SiteBounds {
  const xs = [plot.x, plot.x + plot.w]
  const zs = [plot.z, plot.z + plot.d]
  let h = buildingTop
  for (const p of site?.boundary ?? []) { xs.push(p.x); zs.push(p.z) }
  for (const mass of masses) {
    for (const p of mass.footprint) { xs.push(p.x); zs.push(p.z) }
    h = Math.max(h, mass.baseM + mass.floors * mass.floorHeightM)
  }
  const x = Math.min(...xs)
  const z = Math.min(...zs)
  return { x, z, w: Math.max(...xs) - x, d: Math.max(...zs) - z, h }
}
