/**
 * The blocks style of the 3D model (plan 005): every room a see-through
 * volume in its room type's colour standing on a floor of the same colour,
 * walls as outlines, windows as glass, furniture solid so it reads inside.
 * Same output shape as buildMergedModel (3 buffers plus triangle owners for
 * picking), so MergedModel can draw either: the `glass` buffer carries the
 * see-through parts.
 *
 * buildMergedModel is deliberately left alone: the sun-hours analysis ray-casts
 * against it and must always see the solid building.
 */
import * as THREE from 'three'
import type { Room } from '../../store/canvasStore'
import { hashString } from './editorPalette'
import { furnitureParts } from './furnitureParts'
import { edgesOf, flatten, type MergedModel, type Part } from './mergedGeometry'
import { wallModelPieces } from './modelGeometry'
import { BLOCK_COLORS, MODEL_COLORS, mixHex } from './modelView'

/** The coloured floor under a room volume, metres. */
export const BLOCK_FLOOR_M = 0.03

/** A room's block colour: a vivid hue picked from its room type (so every
 * bedroom matches and a new type gets a new colour), warmed toward red when
 * it breaks a hard rule, lifted toward white when selected. Shared by the
 * merged blocks and the RoomMesh that draws a selected or dragged room. */
export function blockFill(room: Pick<Room, 'objectType' | 'roomType' | 'label'>, invalid: boolean, selected = false): string {
  const key = (typeof room.roomType === 'string' && room.roomType) || room.label || room.objectType
  // Golden-ratio steps spread neighbouring hashes around the wheel.
  const hue = (hashString(key.toLowerCase()) * 0.618033988749895) % 1
  const base = `#${new THREE.Color().setHSL(hue, 0.78, 0.52).getHexString()}`
  const flagged = invalid ? mixHex(base, MODEL_COLORS.invalid, 0.45) : base
  return selected ? mixHex(flagged, BLOCK_COLORS.highlight, 0.35) : flagged
}

/** A block's outline: its own colour, lighter, so rooms read as glass boxes. */
export const blockEdge = (fill: string) => mixHex(fill, BLOCK_COLORS.highlight, 0.45)

/** A room block's geometry, centred on its own height: the polygon outline
 * when there is one, else the box. */
export function blockVolumeGeometry(room: Room, height: number): THREE.BufferGeometry {
  const vertices = room.polygonVertices
  if (vertices && vertices.length >= 3) {
    const shape = new THREE.Shape(vertices.map((v) => new THREE.Vector2(v.x - room.position.x, v.z - room.position.z)))
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
    // Shape y -> world z, extrusion -> y, centred on the block.
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, height / 2, 0)
    return geometry
  }
  return new THREE.BoxGeometry(room.size.w, height, room.size.d)
}

const toRad = THREE.MathUtils.degToRad
function objectMatrix(room: Room, y: number) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(room.position.x, y, room.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(toRad(room.rotation.x), toRad(room.rotation.y), toRad(room.rotation.z))),
    new THREE.Vector3(1, 1, 1),
  )
}

/**
 * @param objects the static objects to draw (already filtered by isMergeable)
 * @param openings every door/window on the floor, to cut wall openings
 * @param invalid ids of rooms breaking a hard rule
 */
export function buildBlockModel(objects: Room[], openings: Room[], invalid: ReadonlySet<string>): MergedModel {
  const solid: Part[] = []
  const glass: Part[] = []
  // Walls draw as outlines only: the room volumes already show the boundary,
  // and full-height wall faces would haze over every room.
  const outlines: Part[] = []
  for (const room of objects) {
    const matrix = objectMatrix(room, room.position.y)
    if (room.objectType === 'wall') {
      for (const piece of wallModelPieces(room, openings)) {
        outlines.push({
          geometry: new THREE.BoxGeometry(...piece.size),
          matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(...piece.position)),
          color: BLOCK_COLORS.wall,
          edgeColor: BLOCK_COLORS.edge,
          owner: room.id,
        })
      }
    } else if (room.objectType === 'furniture') {
      for (const part of furnitureParts(room)) {
        solid.push({
          geometry: new THREE.BoxGeometry(...part.size),
          matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(...part.position)),
          color: part.color,
          edgeColor: MODEL_COLORS.floorEdge,
          owner: room.id,
        })
      }
    } else if (room.objectType === 'window') {
      glass.push({
        geometry: new THREE.BoxGeometry(room.size.w, room.size.h, room.size.d),
        matrix,
        color: MODEL_COLORS.glass,
        edgeColor: BLOCK_COLORS.edge,
        owner: room.id,
      })
    } else {
      const fill = blockFill(room, invalid.has(room.id))
      const floorY = room.position.y - room.size.h / 2
      glass.push({ geometry: blockVolumeGeometry(room, room.size.h), matrix, color: fill, edgeColor: blockEdge(fill), owner: room.id })
      solid.push({
        geometry: blockVolumeGeometry(room, BLOCK_FLOOR_M),
        matrix: objectMatrix(room, floorY + BLOCK_FLOOR_M / 2),
        color: fill,
        edgeColor: blockEdge(fill),
        owner: room.id,
      })
    }
  }
  const s = flatten(solid)
  const g = flatten(glass)
  const edges = edgesOf([...solid, ...glass, ...outlines])
  ;[...solid, ...glass, ...outlines].forEach((part) => part.geometry.dispose())
  return { solid: s.geometry, glass: g.geometry, edges, solidOwners: s.owners, glassOwners: g.owners }
}
