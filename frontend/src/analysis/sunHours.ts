/**
 * Sun-hours analysis (P5): for one date, how many hours each sample point
 * (ground grid, façades, window centres) is in direct sun. Sun sampled every
 * 15 minutes from sunrise to sunset (altitude >= 3°); each sample casts a ray
 * toward the sun against the occluders (walls, slabs, massing prisms) through
 * a BVH. Pure: the scene build runs on the main thread, the ray casting in a
 * worker (sunHours.worker.ts) or directly in tests.
 */
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import type { Room } from '../store/canvasStore'
import { buildMergedModel, isMergeable } from '../components/canvas/mergedGeometry'
import { outwardNormal } from '../site/siteEdit'
import type { Mass, Site, SitePoint } from '../site/siteTypes'
import { solarPosition, sunriseSunset, sunVector, type Where } from './solar'

export const STEP_MINUTES = 15
export const MIN_ALTITUDE = 3
/** Ground grid budget: the spacing grows past 1 m to stay under it. */
export const GROUND_BUDGET = 20000
/** Ray start offset off a surface, metres. */
const LIFT = 0.05

export interface SunSample {
  direction: [number, number, number]
  /** Hours this sample stands for. */
  hours: number
}

/** Sun directions through the day: 15-minute slot centres, symmetric about solar noon. */
export function sunSamples(where: Where, stepMinutes = STEP_MINUTES, minAltitude = MIN_ALTITUDE): SunSample[] {
  const { sunrise } = sunriseSunset(where)
  const step = stepMinutes / 60
  const out: SunSample[] = []
  for (let k = 0; 12 - (k + 0.5) * step > sunrise; k++) {
    for (const t of [12 - (k + 0.5) * step, 12 + (k + 0.5) * step]) {
      const position = solarPosition(where, t)
      if (position.altitude >= minAltitude) out.push({ direction: sunVector(position), hours: step })
    }
  }
  return out
}

/**
 * Hours of direct sun per point. `triangles` is a flat xyz list (3 vertices
 * per triangle); `positions`/`normals` are xyz per point. A point only sees
 * the sun in front of its surface. Ground points (normal straight up) that
 * are covered from directly above (under a slab or inside a mass) are NaN.
 */
export function computeSunHours(
  triangles: Float32Array,
  positions: Float32Array,
  normals: Float32Array,
  samples: SunSample[],
  onProgress?: (done: number) => void,
): Float32Array {
  const count = positions.length / 3
  const hours = new Float32Array(count)
  if (!triangles.length) {
    for (let i = 0; i < count; i++) {
      for (const s of samples) if (dot(normals, i, s.direction) > 0) hours[i] += s.hours
    }
    return hours
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(triangles, 3))
  const bvh = new MeshBVH(geometry)
  const ray = new THREE.Ray()
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < count; i++) {
    ray.origin.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    if (normals[i * 3 + 1] === 1) {
      ray.direction.copy(up)
      if (bvh.raycastFirst(ray, THREE.DoubleSide)) {
        hours[i] = NaN
        continue
      }
    }
    for (const s of samples) {
      if (dot(normals, i, s.direction) <= 0) continue
      ray.direction.set(...s.direction)
      if (!bvh.raycastFirst(ray, THREE.DoubleSide)) hours[i] += s.hours
    }
    if (onProgress && i % 500 === 0) onProgress(i / count)
  }
  geometry.dispose()
  return hours
}

const dot = (normals: Float32Array, i: number, d: [number, number, number]) =>
  normals[i * 3] * d[0] + normals[i * 3 + 1] * d[1] + normals[i * 3 + 2] * d[2]

// ---------------------------------------------------------------- scene build

export interface SunScene {
  triangles: Float32Array
  positions: Float32Array
  normals: Float32Array
  /** Points [0, groundCount) are the ground grid, spaced `groundStep` m. */
  groundCount: number
  groundStep: number
  /** Then façade points, then one point per habitable-room window. */
  facadeCount: number
  windows: { roomId: string; index: number }[]
  /** Habitable rooms to report (bedrooms, living, kitchen). */
  rooms: { id: string; label: string }[]
}

export interface SunSceneInput {
  objects: Room[]
  masses: Mass[]
  site: Site | null
  /** Plot rectangle used for the ground when there is no site. */
  plot?: { x: number; z: number; w: number; d: number } | null
}

export const isHabitable = (room: Room) =>
  room.objectType === 'room' && /bed|living|kitchen/i.test(room.roomType ?? '')

/** Closed prism of a mass: sides plus top and bottom caps. */
export function prismTriangles(footprint: SitePoint[], y0: number, y1: number): number[] {
  const out: number[] = []
  const n = footprint.length
  for (let i = 0; i < n; i++) {
    const a = footprint[i]
    const b = footprint[(i + 1) % n]
    out.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z)
  }
  const faces = THREE.ShapeUtils.triangulateShape(footprint.map((p) => new THREE.Vector2(p.x, p.z)), [])
  for (const face of faces) {
    for (const y of [y0, y1]) for (const k of face) out.push(footprint[k].x, y, footprint[k].z)
  }
  return out
}

export function pointInPolygon(p: SitePoint, poly: SitePoint[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** A room's footprint on plan: its polygon, or its box (quarter turns swap w/d). */
function roomOutline(room: Room): SitePoint[] {
  if (room.polygonVertices && room.polygonVertices.length >= 3) return room.polygonVertices
  const turned = Math.round((room.rotation?.y ?? 0) / 90) % 2 !== 0
  const hw = (turned ? room.size.d : room.size.w) / 2
  const hd = (turned ? room.size.w : room.size.d) / 2
  const { x, z } = room.position
  return [{ x: x - hw, z: z - hd }, { x: x + hw, z: z - hd }, { x: x + hw, z: z + hd }, { x: x - hw, z: z + hd }]
}

/** A wall's (or window's) axis along its length and a horizontal normal, from its box and yaw. */
function wallFrame(wall: Room) {
  const horizontal = wall.size.w >= wall.size.d
  const a = ((wall.rotation?.y ?? 0) * Math.PI) / 180
  // three.js yaw: local +x -> (cos a, 0, -sin a), local +z -> (sin a, 0, cos a).
  const u = horizontal ? { x: Math.cos(a), z: -Math.sin(a) } : { x: Math.sin(a), z: Math.cos(a) }
  return {
    u,
    n: { x: u.z, z: -u.x },
    length: horizontal ? wall.size.w : wall.size.d,
    thickness: horizontal ? wall.size.d : wall.size.w,
  }
}

export function buildSunScene({ objects, masses, site, plot }: SunSceneInput): SunScene {
  // Occluders: the merged model's walls and slabs (glass and furniture left out), plus mass prisms.
  const solids = objects.filter((o) => isMergeable(o) && o.objectType !== 'window' && o.objectType !== 'furniture')
  const openings = objects.filter((o) => o.objectType === 'door' || o.objectType === 'window')
  const model = buildMergedModel(solids, openings, new Set())
  const house = model.solid ? (model.solid.getAttribute('position').array as Float32Array) : new Float32Array()
  model.solid?.dispose()
  model.glass?.dispose()
  model.edges?.dispose()
  const massTris = masses.flatMap((m) => prismTriangles(m.footprint, m.baseM, m.baseM + m.floors * m.floorHeightM))
  const triangles = new Float32Array(house.length + massTris.length)
  triangles.set(house)
  triangles.set(massTris, house.length)

  const positions: number[] = []
  const normals: number[] = []
  const add = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    positions.push(x, y, z)
    normals.push(nx, ny, nz)
  }

  // Ground: the site polygon, else the plot / model extent with a margin.
  const spaces = objects.filter((o) => o.objectType === 'room' || o.objectType === 'stair')
  let region: SitePoint[]
  if (site) region = site.boundary
  else {
    const pts: SitePoint[] = [
      ...spaces.flatMap(roomOutline),
      ...masses.flatMap((m) => m.footprint),
      ...(plot ? [{ x: plot.x, z: plot.z }, { x: plot.x + plot.w, z: plot.z + plot.d }] : []),
    ]
    const margin = 5
    const xs = pts.map((p) => p.x)
    const zs = pts.map((p) => p.z)
    const [x0, x1, z0, z1] = pts.length
      ? [Math.min(...xs) - margin, Math.max(...xs) + margin, Math.min(...zs) - margin, Math.max(...zs) + margin]
      : [-10, 10, -10, 10]
    region = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
  }
  const rx = region.map((p) => p.x)
  const rz = region.map((p) => p.z)
  const [gx0, gx1, gz0, gz1] = [Math.min(...rx), Math.max(...rx), Math.min(...rz), Math.max(...rz)]
  const bboxArea = (gx1 - gx0) * (gz1 - gz0)
  const groundStep = Math.max(1, Math.ceil(Math.sqrt(bboxArea / GROUND_BUDGET) * 2) / 2)
  for (let x = gx0 + groundStep / 2; x < gx1; x += groundStep) {
    for (let z = gz0 + groundStep / 2; z < gz1; z += groundStep) {
      if (site && !pointInPolygon({ x, z }, region)) continue
      add(x, 0.02, z, 0, 1, 0)
    }
  }
  const groundCount = positions.length / 3

  // Façades of masses: every ~1 m along each edge, at each floor's mid-height.
  for (const mass of masses) {
    const fp = mass.footprint
    fp.forEach((a, i) => {
      const b = fp[(i + 1) % fp.length]
      const n = outwardNormal(fp, i)
      const segments = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z)))
      for (let s = 0; s < segments; s++) {
        const t = (s + 0.5) / segments
        const x = a.x + (b.x - a.x) * t + n.x * LIFT
        const z = a.z + (b.z - a.z) * t + n.z * LIFT
        for (let f = 0; f < mass.floors; f++) add(x, mass.baseM + (f + 0.5) * mass.floorHeightM, z, n.x, 0, n.z)
      }
    })
  }

  // Exterior walls: the side of a wall with no room is outside; 1 m spacing, 1.5 m up.
  const outlines = spaces.map((room) => ({ room, level: room.floorLevel ?? 0, outline: roomOutline(room) }))
  const roomAt = (p: SitePoint, level: number) => outlines.find((o) => o.level === level && pointInPolygon(p, o.outline))?.room
  const outsideOf = (host: Room, at: SitePoint) => {
    const { n, thickness } = wallFrame(host)
    const off = thickness / 2 + LIFT
    const level = host.floorLevel ?? 0
    const plus = { x: at.x + n.x * off, z: at.z + n.z * off }
    const minus = { x: at.x - n.x * off, z: at.z - n.z * off }
    const inPlus = roomAt(plus, level)
    const inMinus = roomAt(minus, level)
    if (inPlus && inMinus) return null
    return inPlus ? { point: minus, n: { x: -n.x, z: -n.z }, room: inPlus } : { point: plus, n, room: inMinus }
  }
  const walls = objects.filter((o) => o.objectType === 'wall')
  for (const wall of walls) {
    const { u, length } = wallFrame(wall)
    const y = wall.position.y - wall.size.h / 2 + 1.5
    const segments = Math.max(1, Math.round(length))
    for (let s = 0; s < segments; s++) {
      const along = ((s + 0.5) / segments - 0.5) * length
      const side = outsideOf(wall, { x: wall.position.x + u.x * along, z: wall.position.z + u.z * along })
      if (side) add(side.point.x, y, side.point.z, side.n.x, 0, side.n.z)
    }
  }
  const facadeCount = positions.length / 3 - groundCount

  // Window centres of habitable rooms, just outside the glass.
  const rooms = objects.filter(isHabitable)
  const habitable = new Set(rooms.map((r) => r.id))
  const byId = new Map(objects.map((o) => [o.id, o]))
  const windows: SunScene['windows'] = []
  for (const win of objects.filter((o) => o.objectType === 'window')) {
    const host = (typeof win.hostWallId === 'string' && byId.get(win.hostWallId)) || win
    const side = outsideOf(host, { x: win.position.x, z: win.position.z })
    if (!side?.room || !habitable.has(side.room.id)) continue
    windows.push({ roomId: side.room.id, index: positions.length / 3 })
    add(side.point.x, win.position.y, side.point.z, side.n.x, 0, side.n.z)
  }

  return {
    triangles,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    groundCount,
    groundStep,
    facadeCount,
    windows,
    rooms: rooms.map((r) => ({ id: r.id, label: r.label })),
  }
}

// ---------------------------------------------------------------- summary

export interface SunSummary {
  maxHours: number
  /** Share (0..1) of open ground (not built on) with at least 2 h / 4 h. */
  groundAtLeast2: number
  groundAtLeast4: number
  /** Best window's hours per habitable room; null = no window. */
  rooms: { id: string; label: string; hours: number | null }[]
}

export function summarize(scene: SunScene, hours: Float32Array, samples: SunSample[]): SunSummary {
  let open = 0
  let ge2 = 0
  let ge4 = 0
  for (let i = 0; i < scene.groundCount; i++) {
    const h = hours[i]
    if (Number.isNaN(h)) continue
    open++
    if (h >= 2) ge2++
    if (h >= 4) ge4++
  }
  const best = new Map<string, number>()
  for (const w of scene.windows) best.set(w.roomId, Math.max(best.get(w.roomId) ?? 0, hours[w.index]))
  return {
    maxHours: samples.reduce((sum, s) => sum + s.hours, 0),
    groundAtLeast2: open ? ge2 / open : 0,
    groundAtLeast4: open ? ge4 / open : 0,
    rooms: scene.rooms.map((r) => ({ ...r, hours: best.has(r.id) ? best.get(r.id)! : null })),
  }
}
