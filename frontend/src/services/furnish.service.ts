import api from './api'
import { canvasObjectsToLayoutPlan } from './mvpLayoutAdapter'
import { useCanvasStore, type CanvasFloor, type Room } from '../store/canvasStore'
import type { Connection, Facing, LayoutPlan, PlanZoneSpan } from '../types/contracts'
import { FURNITURE_HEIGHT, FURNITURE_LABEL } from '../components/canvas/furnitureParts'
import { MODEL_COLORS } from '../components/canvas/modelView'

/** One piece from POST /api/furnish: plan metres, centre x/y, NW origin. */
export interface FurnitureItem {
  id: string
  room_id: string
  kind: string
  x: number
  y: number
  w: number
  d: number
  rotation: 0 | 90 | 180 | 270
  floor: number
}

export interface FurnishResult {
  items: FurnitureItem[]
  warnings: string[]
}

/** The plan the editor sends to the server (validation, exports, furnishing). */
export function currentLayoutPlan(): LayoutPlan | null {
  const { rooms, floors, layoutMetadata } = useCanvasStore.getState()
  const footprint = floors[0]?.footprint // every storey shares the footprint; objects carry their floor
  if (!footprint) return null
  const facing = (layoutMetadata.mvpRequirements as { facing?: Facing } | undefined)?.facing
  const connections = Array.isArray(layoutMetadata.mvpConnections) ? (layoutMetadata.mvpConnections as Connection[]) : []
  return canvasObjectsToLayoutPlan(rooms, footprint, facing ?? 'east', connections, layoutMetadata.mvpFootprint as PlanZoneSpan | undefined)
}

/** The plan plus its windows (furniture keeps tall pieces clear of them). */
export function withWindows(plan: LayoutPlan, objects: Room[], footprint: { x: number; z: number }): LayoutPlan {
  const walls = new Map(plan.walls.map((wall) => [wall.id, wall]))
  const windows = objects.flatMap((opening) => {
    const wall = opening.objectType === 'window' && typeof opening.hostWallId === 'string' ? walls.get(opening.hostWallId) : undefined
    if (!wall) return []
    const horizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1)
    const width = horizontal ? opening.size.w : opening.size.d
    const centre = horizontal ? opening.position.x - footprint.x - wall.x1 : opening.position.z - footprint.z - wall.y1
    const offset = Math.round(Math.max(0, centre - width / 2) * 1000) / 1000
    return [{ id: opening.id, wall_ref: wall.id, offset, width, floor: opening.floorLevel ?? wall.floor ?? 0 }]
  })
  return { ...plan, windows }
}

/** Server pieces as editor objects, marked so the next furnish replaces them. */
export function furnitureItemsToObjects(items: FurnitureItem[], footprint: { x: number; z: number }, floors: CanvasFloor[], floorHeight: number): Room[] {
  return items.map((item) => {
    const h = FURNITURE_HEIGHT[item.kind] ?? 0.8
    const elevation = floors.find((floor) => floor.level === item.floor)?.elevation ?? item.floor * floorHeight
    return {
      id: item.id,
      label: FURNITURE_LABEL[item.kind] ?? item.kind,
      roomType: item.kind,
      objectType: 'furniture',
      floorId: `floor_${item.floor}`,
      floorLevel: item.floor,
      position: { x: footprint.x + item.x, y: elevation + h / 2, z: footprint.z + item.y },
      size: { w: item.w, h, d: item.d },
      rotation: { x: 0, y: item.rotation, z: 0 },
      color: MODEL_COLORS.furniture,
      hostRoomId: item.room_id,
      derived: 'furnish',
    }
  })
}

/** Furnish every room of the current plan (one undo step); returns the warnings. */
export async function furnishRooms(): Promise<string[]> {
  const plan = currentLayoutPlan()
  const { rooms, floors, floorHeight, applyFurnishing } = useCanvasStore.getState()
  const footprint = floors[0]?.footprint
  if (!plan || !footprint) return ['There is no layout to furnish yet.']
  const { data } = await api.post<FurnishResult>('/api/furnish', { layout: withWindows(plan, rooms, footprint) })
  applyFurnishing(furnitureItemsToObjects(data.items, footprint, floors, floorHeight))
  return data.warnings
}
