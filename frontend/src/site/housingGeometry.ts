/**
 * A housed mass as a handful of merged buffers (the MergedModel approach):
 * one opaque mesh (slabs, cores, the open floor's room tiles), one
 * translucent mesh (unit volumes + corridors), one ghost mesh (floors above
 * the open floor), all outlines in one line set and lock / pick markers in
 * another. A 20-floor block with 400+ units is still 5 draw calls.
 */
import * as THREE from 'three'
import { edgesOf, flatten, type Part } from '../components/canvas/mergedGeometry'
import { displayRoomColor } from '../components/canvas/editorPalette'
import { MODEL_COLORS, floorTint } from '../components/canvas/modelView'
import type { Vertex } from '../types/contracts'
import type { MassHousing, UnitType } from './housingTypes'
import type { Mass } from './siteTypes'

/** Calm pastels that sit with the white model. */
export const UNIT_COLORS: Record<UnitType, string> = {
  studio: '#c5d3bd',
  '1bhk': '#b6cbd6',
  '2bhk': '#e0cda6',
  '3bhk': '#d5b09f',
  '4bhk': '#c0b3cf',
}
export const CORE_COLOR = '#a9a6a0'
export const CORRIDOR_COLOR = '#d2d0ca'
export const LOCK_COLOR = '#8a5a2b'
export const PICK_COLOR = '#d9653b'

const SLAB = 0.18
/** Gap under the next slab so units read as separate floors. */
const GAP = 0.08
const TILE = 0.03

export interface HousingView {
  /** Open floor: its unit interiors show, floors above ghost (hidden in Top). */
  floor: number | 'all'
  top: boolean
  pickedUnitId: string | null
}

export interface RoomLabel {
  key: string
  text: string
  /** Room width in metres (labels wider than the room are skipped). */
  size: number
  position: [number, number, number]
}

export interface HousingModel {
  solid: THREE.BufferGeometry | null
  units: THREE.BufferGeometry | null
  ghost: THREE.BufferGeometry | null
  edges: THREE.BufferGeometry | null
  markers: THREE.BufferGeometry | null
  /** Unit id per triangle of `solid` / `units` ('' = not a unit). */
  solidOwners: string[]
  unitOwners: string[]
  labels: RoomLabel[]
  /** The floor whose interiors show, or null (all floors closed). */
  openFloor: number | null
}

/** A vertical prism over a plan outline; plan y is world z. */
function prism(outline: Vertex[], y0: number, height: number) {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

const IDENTITY = new THREE.Matrix4()
const part = (geometry: THREE.BufferGeometry, color: string, owner = '', edgeColor: string = MODEL_COLORS.floorEdge): Part =>
  ({ geometry, matrix: IDENTITY, color, edgeColor, owner })

/** Closed loop inset toward the outline's centre, as line-segment pairs. */
function ring(outline: Vertex[], y: number, inset: number, color: THREE.Color, pos: number[], col: number[]) {
  const cx = outline.reduce((s, p) => s + p.x, 0) / outline.length
  const cy = outline.reduce((s, p) => s + p.y, 0) / outline.length
  const pts = outline.map((p) => {
    const dx = cx - p.x
    const dy = cy - p.y
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * inset, y: p.y + (dy / len) * inset }
  })
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]
    pos.push(a.x, y, a.y, b.x, y, b.y)
    col.push(color.r, color.g, color.b, color.r, color.g, color.b)
  })
}

const roomOutline = (r: { x: number; y: number; w: number; h: number; vertices?: Vertex[] | null }): Vertex[] =>
  r.vertices && r.vertices.length >= 3
    ? r.vertices
    : [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]

export function buildHousingModel(housing: MassHousing, mass: Mass, view: HousingView): HousingModel {
  const { result } = housing
  const floors = Math.min(housing.request.floors, mass.floors)
  const h = mass.floorHeightM
  const base = (f: number) => mass.baseM + f * h
  const footprint = mass.footprint.map((p) => ({ x: p.x, y: p.z }))
  const open = view.floor === 'all' ? (view.top ? 0 : null) : Math.min(view.floor, floors - 1)
  // Top view looks straight down: nothing above (and nothing hidden below) the open floor.
  const shown = (f: number) => (view.top ? f === open : open === null || f <= open)
  const ghosted = (f: number) => !view.top && open !== null && f > open

  const solid: Part[] = []
  const units: Part[] = []
  const ghost: Part[] = []
  /** Outlined but not filled: the open floor's unit boundaries. */
  const outlines: Part[] = []
  const labels: RoomLabel[] = []
  const markerPos: number[] = []
  const markerCol: number[] = []
  const lockColor = new THREE.Color(LOCK_COLOR)
  const pickColor = new THREE.Color(PICK_COLOR)
  const volume = h - SLAB - GAP

  for (let f = 0; f < floors; f++) {
    const y = base(f)
    if (shown(f)) {
      solid.push(part(prism(footprint, y, SLAB), MODEL_COLORS.slab))
      for (const core of result.cores) solid.push(part(prism(core, y + SLAB, volume), CORE_COLOR))
      for (const corridor of result.corridors) {
        units.push(f === open ? part(prism(corridor, y + SLAB, TILE), CORRIDOR_COLOR) : part(prism(corridor, y + SLAB, volume), CORRIDOR_COLOR))
      }
    } else if (ghosted(f)) {
      ghost.push(part(prism(footprint, y, SLAB), MODEL_COLORS.slab))
      for (const core of result.cores) ghost.push(part(prism(core, y + SLAB, volume), CORE_COLOR))
    }
  }
  if (open === null && floors > 0) solid.push(part(prism(footprint, base(floors), SLAB), MODEL_COLORS.slab))

  for (const unit of result.units) {
    if (unit.floor >= floors) continue
    const y = base(unit.floor) + SLAB
    if (ghosted(unit.floor)) {
      ghost.push(part(prism(unit.outline, y, volume), UNIT_COLORS[unit.unit_type]))
      continue
    }
    if (!shown(unit.floor)) continue
    let top = y + volume
    if (unit.floor === open) {
      // Open floor: the unit's rooms as floor tiles, the unit as a low outline.
      top = y + TILE
      for (const room of unit.plan.rooms) {
        const outline = roomOutline(room)
        solid.push(part(prism(outline, y + 0.005, TILE), floorTint(displayRoomColor({ roomType: room.type, label: room.label })), unit.id, MODEL_COLORS.floorEdge))
        if (view.top) {
          const c = outline.reduce((s, p) => ({ x: s.x + p.x / outline.length, y: s.y + p.y / outline.length }), { x: 0, y: 0 })
          labels.push({ key: `${unit.id}:${room.id}`, text: room.label, size: room.w, position: [c.x, y + TILE + 0.05, c.y] })
        }
      }
      outlines.push(part(prism(unit.outline, y, TILE * 2), '', unit.id, MODEL_COLORS.edge))
    } else {
      units.push(part(prism(unit.outline, y, volume), UNIT_COLORS[unit.unit_type], unit.id, MODEL_COLORS.floorEdge))
    }
    if (unit.locked) {
      ring(unit.outline, top + 0.02, 0.25, lockColor, markerPos, markerCol)
      ring(unit.outline, top + 0.02, 0.4, lockColor, markerPos, markerCol)
    }
    if (unit.id === view.pickedUnitId) ring(unit.outline, top + 0.03, 0.08, pickColor, markerPos, markerCol)
  }

  const s = flatten(solid)
  const u = flatten(units)
  const g = flatten(ghost)
  const edges = edgesOf([...solid, ...units, ...outlines])
  ;[...solid, ...units, ...ghost, ...outlines].forEach((p) => p.geometry.dispose())
  let markers: THREE.BufferGeometry | null = null
  if (markerPos.length) {
    markers = new THREE.BufferGeometry()
    markers.setAttribute('position', new THREE.Float32BufferAttribute(markerPos, 3))
    markers.setAttribute('color', new THREE.Float32BufferAttribute(markerCol, 3))
  }
  return {
    solid: s.geometry,
    units: u.geometry,
    ghost: g.geometry,
    edges,
    markers,
    solidOwners: s.owners,
    unitOwners: u.owners,
    labels,
    openFloor: open,
  }
}

export const disposeHousingModel = (m: HousingModel) =>
  [m.solid, m.units, m.ghost, m.edges, m.markers].forEach((g) => g?.dispose())

/** Draw calls the model costs (one per non-empty buffer). */
export const housingDrawCalls = (m: HousingModel) => [m.solid, m.units, m.ghost, m.edges, m.markers].filter(Boolean).length
