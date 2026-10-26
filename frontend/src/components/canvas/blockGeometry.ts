/**
 * The blocks style of the 3D model (plan 005): every room a coloured volume
 * by zone, walls and furniture cut at plan height, windows clipped to the cut.
 * Same output shape as buildMergedModel (3 buffers plus triangle owners for
 * picking), so MergedModel can draw either.
 *
 * buildMergedModel is deliberately left alone: the sun-hours analysis ray-casts
 * against it and must always see the full-height building.
 */
import * as THREE from 'three'
import type { Room } from '../../store/canvasStore'
import { furnitureParts } from './furnitureParts'
import { edgesOf, flatten, type MergedModel, type Part } from './mergedGeometry'
import { wallModelPieces } from './modelGeometry'
import { BLOCK_COLORS, BLOCK_INSET_M, MODEL_COLORS, PLAN_CUT_M, mixHex } from './modelView'
import { zoneForRoom } from './zoneModel'


/** A box in an object's local frame: centre at `position`, the object's own
 * centre at the origin (so its floor is at y = -height / 2). */
export interface LocalBox {
  size: [number, number, number]
  position: [number, number, number]
}

/** The part of a vertical span [centre - h/2, centre + h/2] below `cutY`, or null. */
export function clipSpan(centerY: number, height: number, cutY: number): { centerY: number; height: number } | null {
  const bottom = centerY - height / 2
  const top = Math.min(centerY + height / 2, cutY)
  if (top - bottom <= 1e-4) return null
  return { centerY: (bottom + top) / 2, height: top - bottom }
}

/** Keep each local box's part below the cut, for an object `objectHeight` tall
 * whose floor is its local bottom. Boxes wholly above the cut are dropped. */
export function clipToCut<T extends LocalBox>(boxes: T[], objectHeight: number, cut = PLAN_CUT_M): T[] {
  const cutY = -objectHeight / 2 + cut
  const kept: T[] = []
  for (const box of boxes) {
    const span = clipSpan(box.position[1], box.size[1], cutY)
    if (!span) continue
    kept.push({ ...box, size: [box.size[0], span.height, box.size[2]], position: [box.position[0], span.centerY, box.position[2]] })
  }
  return kept
}

/** A wall's pieces (openings already cut out) below the plan cut. */
export const blockWallPieces = (wall: Room, openings: Room[], cut = PLAN_CUT_M) =>
  clipToCut(wallModelPieces(wall, openings), wall.size.h, cut)

/** Furniture proxy parts below the plan cut (a wardrobe must not poke out). */
export const blockFurnitureParts = (room: Room, cut = PLAN_CUT_M) =>
  clipToCut(furnitureParts(room), room.size.h, cut)

/** How tall a room block is: a little under the cut, so walls stand proud of it. */
export const blockHeight = (cut = PLAN_CUT_M) => Math.max(0.2, cut - BLOCK_INSET_M)

/** A room's block colour: its zone, warmed toward red when it breaks a hard
 * rule, lifted toward white when selected. Shared by the merged blocks and
 * the RoomMesh that draws a selected or dragged room, so they always match. */
export function blockFill(room: Pick<Room, 'objectType' | 'roomType' | 'label'>, invalid: boolean, selected = false): string {
  const base = BLOCK_COLORS.zone[zoneForRoom(room)]
  const flagged = invalid ? mixHex(base, MODEL_COLORS.invalid, 0.45) : base
  return selected ? mixHex(flagged, BLOCK_COLORS.highlight, 0.35) : flagged
}

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

/** World y of a room block's centre: it stands on the room's floor. */
export const blockCenterY = (room: Room, height: number) => room.position.y - room.size.h / 2 + height / 2

const toRad = THREE.MathUtils.degToRad
function objectMatrix(room: Room, y: number) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(room.position.x, y, room.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(toRad(room.rotation.x), toRad(room.rotation.y), toRad(room.rotation.z))),
    new THREE.Vector3(1, 1, 1),
  )
}

export interface BlockOptions {
  /** Plan cut above each floor, metres. */
  cut?: number
  /** Floor elevation by level, for windows (their own box sits above the floor). */
  floorElevations?: ReadonlyMap<number, number>
}

/**
 * @param objects the static objects to draw (already filtered by isMergeable)
 * @param openings every door/window on the floor, to cut wall openings
 * @param invalid ids of rooms breaking a hard rule
 */
export function buildBlockModel(objects: Room[], openings: Room[], invalid: ReadonlySet<string>, options: BlockOptions = {}): MergedModel {
  const cut = options.cut ?? PLAN_CUT_M
  const height = blockHeight(cut)
  const solid: Part[] = []
  const glass: Part[] = []
  for (const room of objects) {
    if (room.objectType === 'wall') {
      const matrix = objectMatrix(room, room.position.y)
      for (const piece of blockWallPieces(room, openings, cut)) {
        solid.push({
          geometry: new THREE.BoxGeometry(...piece.size),
          matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(...piece.position)),
          color: BLOCK_COLORS.wall,
          edgeColor: BLOCK_COLORS.edge,
          owner: room.id,
        })
      }
    } else if (room.objectType === 'furniture') {
      const matrix = objectMatrix(room, room.position.y)
      for (const part of blockFurnitureParts(room, cut)) {
        solid.push({
          geometry: new THREE.BoxGeometry(...part.size),
          matrix: matrix.clone().multiply(new THREE.Matrix4().makeTranslation(...part.position)),
          color: part.color,
          edgeColor: MODEL_COLORS.floorEdge,
          owner: room.id,
        })
      }
    } else if (room.objectType === 'window') {
      const floor = options.floorElevations?.get(room.floorLevel ?? 0) ?? 0
      const span = clipSpan(room.position.y, room.size.h, floor + cut)
      if (!span) continue
      glass.push({
        geometry: new THREE.BoxGeometry(room.size.w, span.height, room.size.d),
        matrix: objectMatrix(room, span.centerY),
        color: MODEL_COLORS.glass,
        edgeColor: BLOCK_COLORS.edge,
        owner: room.id,
      })
    } else {
      solid.push({
        geometry: blockVolumeGeometry(room, height),
        matrix: objectMatrix(room, blockCenterY(room, height)),
        color: blockFill(room, invalid.has(room.id)),
        edgeColor: BLOCK_COLORS.edge,
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
