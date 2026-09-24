/**
 * Shared editor-only palette for the graphite design system.
 *
 * The workspace is a warm near-black well; the drawing sheet is a slightly
 * lighter graphite surface so the plan reads as a deliberate architectural
 * drawing. Walls and frames read white/gray; rooms use only the zone
 * colors below, the same ember scheme as the landing page's drawing.
 *
 * Room colors are resolved at render time via `displayRoomColor` so layouts
 * saved with older bright palettes still render in the muted system without
 * rewriting any persisted layout data.
 */
export const EDITOR_PALETTE = {
  // The canvas well fades to the landing page's near-black (tailwind `night`).
  workspaceHighlight: '#221E1C',
  workspaceStart: '#171413',
  workspaceEnd: '#0B0A0A',
  planSheetStart: '#252220',
  planSheetEnd: '#201D1C',
  planGrid: '#353739',
  planFrame: '#D7D7D5',
  selection: '#FF5A36',
  selectionSoft: '#FF9A7A',
  invalid: '#C97B70',
  dimension: '#A9AAAC',
  chrome: '#1C1D1E',
  card: '#232425',
  measure: '#C9A96E',
  // Access graph: how two rooms meet.
  edgeDoor: '#BDBDC0',
  edgeOpen: '#FF7A45',
  edgeWall: '#6A6A6E',
  warning: '#C9A96E',
} as const

/**
 * Room colors, keyed by zone the way the landing page's drawing is: living
 * spaces glow ember, service rooms amber, private rooms stay warm and dark,
 * wet rooms a touch cooler so they read apart, circulation darkest. Muted
 * enough for walls, doors and selection to stay the brightest things.
 */
export const MUTED_ROOM_COLORS = {
  ember: '#7A3325', // living, lounge, dining
  terracotta: '#8A4A36', // entry, balcony, reception
  amber: '#86573C', // kitchen, pantry
  warmGray: '#4F4946', // bedrooms
  warmGrayLight: '#5A524D', // master bedroom
  mauve: '#5E5049', // study, pooja
  coolGray: '#474D51', // bathrooms
  charcoal: '#3E3936', // corridors, stairs
  stone: '#48423E', // utility, storage, parking
} as const

const ROOM_COLOR_CYCLE: string[] = [
  MUTED_ROOM_COLORS.ember,
  MUTED_ROOM_COLORS.warmGray,
  MUTED_ROOM_COLORS.amber,
  MUTED_ROOM_COLORS.mauve,
  MUTED_ROOM_COLORS.terracotta,
  MUTED_ROOM_COLORS.warmGrayLight,
  MUTED_ROOM_COLORS.coolGray,
]

/** Room-type identities stay stable so the same room type always reads the same. */
const ROOM_TYPE_COLORS: Record<string, string> = {
  living_room: MUTED_ROOM_COLORS.ember,
  lounge: MUTED_ROOM_COLORS.ember,
  dining: MUTED_ROOM_COLORS.ember, // what the layout engine emits
  dining_room: MUTED_ROOM_COLORS.ember,
  entry: MUTED_ROOM_COLORS.terracotta,
  foyer: MUTED_ROOM_COLORS.terracotta,
  balcony: MUTED_ROOM_COLORS.terracotta,
  reception: MUTED_ROOM_COLORS.terracotta,
  waiting_room: MUTED_ROOM_COLORS.terracotta,
  lobby: MUTED_ROOM_COLORS.terracotta,
  kitchen: MUTED_ROOM_COLORS.amber,
  pantry: MUTED_ROOM_COLORS.amber,
  bedroom: MUTED_ROOM_COLORS.warmGray,
  kids_bedroom: MUTED_ROOM_COLORS.warmGray,
  guest_bedroom: MUTED_ROOM_COLORS.warmGray,
  master_bedroom: MUTED_ROOM_COLORS.warmGrayLight,
  consultation_room: MUTED_ROOM_COLORS.warmGray,
  study: MUTED_ROOM_COLORS.mauve,
  pooja_room: MUTED_ROOM_COLORS.mauve,
  office: MUTED_ROOM_COLORS.mauve,
  open_workspace: MUTED_ROOM_COLORS.warmGrayLight,
  meeting_room: MUTED_ROOM_COLORS.mauve,
  conference_room: MUTED_ROOM_COLORS.mauve,
  bathroom: MUTED_ROOM_COLORS.coolGray,
  toilet: MUTED_ROOM_COLORS.coolGray,
  hallway: MUTED_ROOM_COLORS.charcoal,
  corridor: MUTED_ROOM_COLORS.charcoal,
  stairs: MUTED_ROOM_COLORS.charcoal,
  utility: MUTED_ROOM_COLORS.stone,
  utility_room: MUTED_ROOM_COLORS.stone,
  storage: MUTED_ROOM_COLORS.stone,
  store_room: MUTED_ROOM_COLORS.stone,
  garage: MUTED_ROOM_COLORS.stone,
  parking: MUTED_ROOM_COLORS.stone,
}

/** Non-room object types keep structural, near-neutral colors. */
const OBJECT_TYPE_COLORS: Record<string, string> = {
  wall: '#BDBDC0',
  door: '#9C8468',
  window: '#7C93A6',
  stair: MUTED_ROOM_COLORS.charcoal,
  floor: '#373738',
  open_space: '#3F444B',
  corridor: MUTED_ROOM_COLORS.charcoal,
  lift: '#5A5A5E',
  shaft: '#48484A',
  furniture: '#6E6659',
  column: '#909094',
  generic: MUTED_ROOM_COLORS.warmGray,
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

interface RoomColorSource {
  objectType?: string
  roomType?: unknown
  label?: string
}

/**
 * Resolves the muted display color for a canvas object. Persisted layout
 * data is never mutated — legacy bright colors are simply ignored in favor
 * of the room-type identity color (or a stable pick from the muted cycle).
 */
export function displayRoomColor(room: RoomColorSource): string {
  const objectType = room.objectType ?? 'room'
  if (objectType !== 'room') {
    return OBJECT_TYPE_COLORS[objectType] ?? OBJECT_TYPE_COLORS.generic
  }
  const roomType = typeof room.roomType === 'string' ? room.roomType.toLowerCase() : ''
  if (roomType && ROOM_TYPE_COLORS[roomType]) return ROOM_TYPE_COLORS[roomType]
  const key = roomType || (room.label ?? '').toLowerCase() || 'room'
  return ROOM_COLOR_CYCLE[hashString(key) % ROOM_COLOR_CYCLE.length]
}

export type ZoneType =
  | 'public'
  | 'private'
  | 'collaborative'
  | 'service'
  | 'circulation'
  | 'utility'

export const ZONE_ORDER: ZoneType[] = [
  'public',
  'private',
  'collaborative',
  'service',
  'circulation',
  'utility',
]

export const ZONE_META: Record<ZoneType, { label: string; color: string }> = {
  public: { label: 'Public', color: MUTED_ROOM_COLORS.ember },
  private: { label: 'Private', color: MUTED_ROOM_COLORS.warmGrayLight },
  collaborative: { label: 'Collaborative', color: MUTED_ROOM_COLORS.mauve },
  service: { label: 'Service', color: MUTED_ROOM_COLORS.amber },
  circulation: { label: 'Circulation', color: MUTED_ROOM_COLORS.charcoal },
  utility: { label: 'Utility', color: MUTED_ROOM_COLORS.stone },
}
