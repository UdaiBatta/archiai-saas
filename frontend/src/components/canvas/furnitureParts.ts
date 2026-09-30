/**
 * Low-poly furniture proxies for the white model: each kind is a handful of
 * boxes in the object's own frame (centre of its box, +z = front, the side
 * away from the wall it backs onto). Drawn merged (mergedGeometry) or, for
 * the selection, as plain meshes (RoomMesh) - the same boxes either way.
 */
import type { Room } from '../../store/canvasStore'
import { MODEL_COLORS } from './modelView'

export interface FurniturePart {
  size: [number, number, number]
  position: [number, number, number]
  color: string
}

/** Proxy height per kind (the backend only sends the plan footprint). */
export const FURNITURE_HEIGHT: Record<string, number> = {
  double_bed: 0.85,
  single_bed: 0.85,
  sofa: 0.82,
  coffee_table: 0.4,
  dining_table_6: 0.75,
  dining_table_4: 0.75,
  kitchen_counter: 0.9,
  wardrobe: 2.1,
  wc: 0.8,
  basin: 0.85,
  shower: 2.0,
  desk: 0.75,
}

export const FURNITURE_LABEL: Record<string, string> = {
  double_bed: 'Double bed',
  single_bed: 'Single bed',
  sofa: 'Sofa',
  coffee_table: 'Coffee table',
  dining_table_6: 'Dining table (6)',
  dining_table_4: 'Dining table (4)',
  kitchen_counter: 'Kitchen counter',
  wardrobe: 'Wardrobe',
  wc: 'WC',
  basin: 'Basin',
  shower: 'Shower',
  desk: 'Desk',
}

const { furniture: BODY, furnitureSoft: SOFT, furnitureDark: DARK } = MODEL_COLORS

/** Box from its bottom (y0) up, in a frame whose floor is y = 0. */
const at = (w: number, h: number, d: number, x: number, y0: number, z: number, color: string = BODY): FurniturePart => ({
  size: [w, h, d],
  position: [x, y0 + h / 2, z],
  color,
})

function legs(w: number, d: number, h: number, t = 0.05): FurniturePart[] {
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => at(t, h, t, sx * (w / 2 - t), 0, sz * (d / 2 - t), DARK)))
}

function table(w: number, d: number, h: number): FurniturePart[] {
  return [at(w, 0.04, d, 0, h - 0.04, 0), ...legs(w, d, h - 0.04)]
}

function chair(x: number, z: number, facing: 1 | -1, alongX: boolean): FurniturePart[] {
  // Seat plus a back on the side away from the table.
  const back = alongX ? at(0.42, 0.45, 0.04, x, 0.45, z - facing * 0.19, SOFT) : at(0.04, 0.45, 0.42, x - facing * 0.19, 0.45, z, SOFT)
  return [at(0.42, 0.45, 0.42, x, 0, z, SOFT), back]
}

function parts(kind: string, w: number, d: number, h: number): FurniturePart[] {
  switch (kind) {
    case 'double_bed':
    case 'single_bed': {
      const pillows = kind === 'double_bed' ? 2 : 1
      const pw = (w - 0.2) / pillows - 0.06
      return [
        at(w, 0.3, d, 0, 0, 0, DARK),
        at(w - 0.04, 0.2, d - 0.1, 0, 0.3, 0.03, SOFT),
        at(w, h, 0.08, 0, 0, -d / 2 + 0.04),
        ...Array.from({ length: pillows }, (_, i) => at(pw, 0.12, 0.34, -w / 2 + 0.1 + (i + 0.5) * (pw + 0.06), 0.5, -d / 2 + 0.3)),
      ]
    }
    case 'sofa':
      return [
        at(w, 0.42, d, 0, 0, 0, DARK),
        at(w - 0.36, 0.1, d - 0.25, 0, 0.42, 0.1, SOFT),
        at(w, h - 0.42, 0.22, 0, 0.42, -d / 2 + 0.11),
        at(0.18, 0.2, d, -w / 2 + 0.09, 0.42, 0),
        at(0.18, 0.2, d, w / 2 - 0.09, 0.42, 0),
      ]
    case 'coffee_table':
    case 'desk':
      return table(w, d, h)
    case 'dining_table_6':
    case 'dining_table_4': {
      const alongX = w >= d
      const long = alongX ? w : d
      const perSide = 2
      const seats: FurniturePart[] = []
      for (let i = 0; i < perSide; i++) {
        const t = -long / 2 + (long / perSide) * (i + 0.5)
        for (const side of [-1, 1] as const) {
          seats.push(...(alongX ? chair(t, side * (d / 2 + 0.2), side, true) : chair(side * (w / 2 + 0.2), t, side, false)))
        }
      }
      if (kind === 'dining_table_6') {
        for (const side of [-1, 1] as const) {
          seats.push(...(alongX ? chair(side * (w / 2 + 0.2), 0, side, false) : chair(0, side * (d / 2 + 0.2), side, true)))
        }
      }
      return [...table(w, d, h), ...seats]
    }
    case 'kitchen_counter':
      return [at(w, h - 0.04, d - 0.04, 0, 0, -0.02, DARK), at(w, 0.04, d, 0, h - 0.04, 0)]
    case 'wardrobe': {
      const doors = Math.max(2, Math.round(w / 0.6))
      const dw = w / doors
      return [
        at(w, h, d - 0.02, 0, 0, -0.01),
        ...Array.from({ length: doors }, (_, i) => at(dw - 0.02, h - 0.1, 0.02, -w / 2 + dw * (i + 0.5), 0.05, d / 2 - 0.01, SOFT)),
      ]
    }
    case 'wc':
      return [at(w, h, 0.18, 0, 0, -d / 2 + 0.09, SOFT), at(w - 0.04, 0.4, d - 0.2, 0, 0, 0.1)]
    case 'basin':
      return [at(w - 0.06, h - 0.05, d - 0.06, 0, 0, -0.03, DARK), at(w, 0.05, d, 0, h - 0.05, 0, SOFT)]
    case 'shower':
      return [at(w, 0.06, d, 0, 0, 0, SOFT), at(0.03, h, d, -w / 2 + 0.015, 0, 0), at(w / 2, h, 0.03, -w / 4, 0, d / 2 - 0.015)]
    default:
      // A hand-placed generic proxy: a table-like top on four legs.
      return [at(w, Math.min(0.12, h), d, 0, Math.max(0, h - 0.12), 0), ...legs(w, d, Math.max(0.05, h - 0.12), Math.min(0.07, w / 4, d / 4))]
  }
}

/** The proxy's boxes, centred on the object's box (position.y is its middle). */
export function furnitureParts(room: Room): FurniturePart[] {
  const { w, h, d } = room.size
  return parts(room.roomType ?? '', w, d, h).map((part) => ({
    ...part,
    position: [part.position[0], part.position[1] - h / 2, part.position[2]],
  }))
}
