/**
 * The static part of the 3D model as three merged buffers: every wall piece
 * and floor slab in one opaque mesh, every window in one glass mesh, and all
 * their outlines in one line set. Drawing ~400 separate meshes (plus a shadow
 * pass each) made every drag frame expensive; the merged model is 3 draws and
 * is only rebuilt when a static object changes, never during a drag (the
 * dragged object is left out and rendered on its own).
 *
 * Mirrors RoomMesh's solid-3D look exactly: same boxes, heights, colours.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Room } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { displayRoomColor } from './editorPalette'
import { wallModelPieces } from './modelGeometry'
import { MODEL_COLORS, floorTint, mixHex } from './modelView'

/** Floor slabs are drawn this thick in the 3D model (RoomMesh's modelSurface). */
const SLAB = 0.045
const EDGE_ANGLE = 15

export interface MergedModel {
  solid: THREE.BufferGeometry | null
  glass: THREE.BufferGeometry | null
  edges: THREE.BufferGeometry | null
  /** Object id for each triangle of `solid` / `glass` (picking). */
  solidOwners: string[]
  glassOwners: string[]
}

/** Objects the merged model draws; everything else stays a RoomMesh. */
export function isMergeable(room: Room): boolean {
  if (room.objectType === 'wall' || room.objectType === 'window') return true
  return COMPONENT_REGISTRY[room.objectType]?.category === 'space'
}

const toRad = THREE.MathUtils.degToRad

function objectMatrix(room: Room, y: number) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(room.position.x, y, room.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(toRad(room.rotation.x), toRad(room.rotation.y), toRad(room.rotation.z))),
    new THREE.Vector3(1, 1, 1),
  )
}

/** A floor slab: the polygon outline when there is one, else the box. */
function slabGeometry(room: Room) {
  const vertices = room.polygonVertices
  if (vertices && vertices.length >= 3) {
    const shape = new THREE.Shape(vertices.map((v) => new THREE.Vector2(v.x - room.position.x, v.z - room.position.z)))
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false })
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, SLAB / 2, 0)
    return geometry
  }
  return new THREE.BoxGeometry(room.size.w, SLAB, room.size.d)
}

export interface Part {
  geometry: THREE.BufferGeometry
  matrix: THREE.Matrix4
  color: string
  edgeColor: string
  owner: string
}

export function flatten(parts: Part[]) {
  if (!parts.length) return { geometry: null, owners: [] as string[] }
  const owners: string[] = []
  const pieces = parts.map((part) => {
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone()
    g.deleteAttribute('uv')
    g.applyMatrix4(part.matrix)
    const color = new THREE.Color(part.color)
    const count = g.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    for (let t = 0; t < count / 3; t++) owners.push(part.owner)
    return g
  })
  const geometry = mergeGeometries(pieces, false)
  pieces.forEach((g) => g.dispose())
  return { geometry, owners }
}

export function edgesOf(parts: Part[]) {
  if (!parts.length) return null
  const lines = parts.map((part) => {
    const e = new THREE.EdgesGeometry(part.geometry, EDGE_ANGLE)
    e.applyMatrix4(part.matrix)
    const color = new THREE.Color(part.edgeColor)
    const count = e.getAttribute('position').count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3)
    e.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return e
  })
  const geometry = mergeGeometries(lines, false)
  lines.forEach((g) => g.dispose())
  return geometry
}

/**
 * @param objects the static objects to draw (already filtered by isMergeable)
 * @param openings every door/window on the floor, to cut wall openings
 * @param invalid ids of rooms breaking a hard rule (red-tinted floors)
 */
export function buildMergedModel(objects: Room[], openings: Room[], invalid: ReadonlySet<string>): MergedModel {
  const solid: Part[] = []
  const glass: Part[] = []
  for (const room of objects) {
    if (room.objectType === 'wall') {
      const matrix = objectMatrix(room, room.position.y)
      for (const piece of wallModelPieces(room, openings)) {
        solid.push({
          geometry: new THREE.BoxGeometry(...piece.size),
          matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(...piece.position)),
          color: MODEL_COLORS.wall,
          edgeColor: MODEL_COLORS.edge,
          owner: room.id,
        })
      }
    } else if (room.objectType === 'window') {
      glass.push({
        geometry: new THREE.BoxGeometry(room.size.w, room.size.h, room.size.d),
        matrix: objectMatrix(room, room.position.y),
        color: MODEL_COLORS.glass,
        edgeColor: MODEL_COLORS.edge,
        owner: room.id,
      })
    } else {
      const tint = floorTint(displayRoomColor(room))
      solid.push({
        geometry: slabGeometry(room),
        // Slab sits on the floor: bottom of the object's box, SLAB thick.
        matrix: objectMatrix(room, room.position.y - room.size.h / 2 + SLAB / 2),
        color: invalid.has(room.id) ? mixHex(tint, MODEL_COLORS.invalid, 0.35) : tint,
        edgeColor: MODEL_COLORS.floorEdge,
        owner: room.id,
      })
    }
  }
  const s = flatten(solid)
  const g = flatten(glass)
  const edges = edgesOf([...solid, ...glass])
  ;[...solid, ...glass].forEach((part) => part.geometry.dispose())
  return { solid: s.geometry, glass: g.geometry, edges, solidOwners: s.owners, glassOwners: g.owners }
}
