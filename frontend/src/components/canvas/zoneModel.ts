import type { Room } from '../../store/canvasStore'
import { ZONE_META, ZONE_ORDER, type ZoneType } from './editorPalette'

/**
 * Client-side zoning classification, derived deterministically from each
 * object's room type / object type. This is a safe functional placeholder:
 * layouts carry no zoning data yet, so the mapping lives in one place and
 * can be swapped for real backend zoning without touching the views.
 */
const ROOM_TYPE_ZONES: Record<string, ZoneType> = {
  living_room: 'public',
  lounge: 'public',
  dining_room: 'public',
  dining: 'public', // what the layout engine emits
  lobby: 'public',
  reception: 'public',
  waiting_room: 'public',
  entry: 'public',
  balcony: 'public',
  cafe: 'public',
  retail_space: 'public',
  classroom: 'collaborative',
  meeting_room: 'collaborative',
  conference_room: 'collaborative',
  office: 'collaborative',
  open_workspace: 'collaborative',
  study: 'collaborative',
  consultation_room: 'collaborative',
  bedroom: 'private',
  master_bedroom: 'private',
  kids_bedroom: 'private',
  guest_bedroom: 'private',
  bathroom: 'private',
  toilet: 'private',
  pooja_room: 'private',
  kitchen: 'service',
  pantry: 'service',
  laundry: 'service',
  garage: 'service',
  parking: 'service',
  hallway: 'circulation',
  corridor: 'circulation',
  stairs: 'circulation',
  utility: 'utility',
  utility_room: 'utility',
  storage: 'utility',
  store_room: 'utility',
  mechanical_room: 'utility',
}

const OBJECT_TYPE_ZONES: Partial<Record<string, ZoneType>> = {
  corridor: 'circulation',
  stair: 'circulation',
  lift: 'circulation',
  shaft: 'utility',
  open_space: 'public',
}

/** Object types that participate in zoning (spaces, not walls/openings). */
export function isZonableObject(room: Room) {
  return (
    room.objectType === 'room' ||
    room.objectType === 'corridor' ||
    room.objectType === 'stair' ||
    room.objectType === 'lift' ||
    room.objectType === 'shaft' ||
    room.objectType === 'open_space'
  )
}

export function zoneForRoom(room: Pick<Room, 'objectType' | 'roomType' | 'label'>): ZoneType {
  const byObject = OBJECT_TYPE_ZONES[room.objectType]
  if (room.objectType !== 'room' && byObject) return byObject
  const roomType = typeof room.roomType === 'string' ? room.roomType.toLowerCase() : ''
  if (roomType && ROOM_TYPE_ZONES[roomType]) return ROOM_TYPE_ZONES[roomType]
  const label = (room.label ?? '').toLowerCase()
  for (const [key, zone] of Object.entries(ROOM_TYPE_ZONES)) {
    if (label.includes(key.replace(/_/g, ' '))) return zone
  }
  return room.objectType === 'room' ? 'private' : 'utility'
}

export interface ZoneSummaryRow {
  zone: ZoneType
  label: string
  color: string
  count: number
  areaSqm: number
  percent: number
}

/** Per-zone area/count/percent for the given objects (one floor's worth). */
export function summarizeZones(rooms: Room[]): ZoneSummaryRow[] {
  const zonable = rooms.filter(isZonableObject)
  const totals = new Map<ZoneType, { count: number; area: number }>()
  for (const room of zonable) {
    const zone = zoneForRoom(room)
    const entry = totals.get(zone) ?? { count: 0, area: 0 }
    entry.count += 1
    entry.area += room.size.w * room.size.d
    totals.set(zone, entry)
  }
  const totalArea = [...totals.values()].reduce((sum, entry) => sum + entry.area, 0)
  return ZONE_ORDER.filter((zone) => totals.has(zone)).map((zone) => {
    const entry = totals.get(zone)!
    return {
      zone,
      label: ZONE_META[zone].label,
      color: ZONE_META[zone].color,
      count: entry.count,
      areaSqm: entry.area,
      percent: totalArea > 0 ? (entry.area / totalArea) * 100 : 0,
    }
  })
}
