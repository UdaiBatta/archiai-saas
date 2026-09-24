/**
 * Shared editor-only palette for the graphite design system.
 *
 * The workspace is a dark ash-gray well; the drawing sheet is a slightly
 * lighter graphite surface so the plan reads as a deliberate architectural
 * drawing. Walls and frames read white/gray; rooms use only the muted
 * architectural colors below.
 *
 * Room colors are resolved at render time via `displayRoomColor` so layouts
 * saved with older bright palettes still render in the muted system without
 * rewriting any persisted layout data.
 */
export const EDITOR_PALETTE = {
  workspaceHighlight: '#242526',
  workspaceStart: '#1D1E1F',
  workspaceEnd: '#171819',
  planSheetStart: '#242526',
  planSheetEnd: '#202122',
  planGrid: '#353739',
  planFrame: '#D7D7D5',
  selection: '#8069DF',
  selectionSoft: '#A18EF0',
  invalid: '#C97B70',
  dimension: '#A9AAAC',
  chrome: '#1C1D1E',
  card: '#232425',
  measure: '#C9A96E',
  // Access graph: how two rooms meet.
  edgeDoor: '#BDBDC0',
  edgeOpen: '#8069DF',
  edgeWall: '#6A6A6E',
  warning: '#C9A96E',
} as const

/**
 * Muted architectural room colors — the only colors allowed inside plans:
 * slate blue, sage green, graphite gray, plum, warm brown, sand, teal-gray.
 */
export const MUTED_ROOM_COLORS = {
  slateBlue: '#5F6E88',
  sageGreen: '#6E7F68',
  graphiteGray: '#4A4E56',
  plum: '#71657E',
  warmBrown: '#84705B',
  sand: '#8A7D64',
  tealGray: '#5E7876',
  deepBlueGray: '#4E5B72',
  charcoal: '#3A3E45',
} as const

const ROOM_COLOR_CYCLE: string[] = [
  MUTED_ROOM_COLORS.slateBlue,
  MUTED_ROOM_COLORS.sageGreen,
  MUTED_ROOM_COLORS.plum,
  MUTED_ROOM_COLORS.warmBrown,
  MUTED_ROOM_COLORS.sand,
  MUTED_ROOM_COLORS.tealGray,
  MUTED_ROOM_COLORS.deepBlueGray,
]

/** Room-type identities stay stable so the same room type always reads the same. */
const ROOM_TYPE_COLORS: Record<string, string> = {
  living_room: MUTED_ROOM_COLORS.slateBlue,
  lounge: MUTED_ROOM_COLORS.slateBlue,
  bedroom: MUTED_ROOM_COLORS.sageGreen,
  master_bedroom: MUTED_ROOM_COLORS.tealGray,
  kids_bedroom: MUTED_ROOM_COLORS.sageGreen,
  guest_bedroom: MUTED_ROOM_COLORS.sageGreen,
  kitchen: MUTED_ROOM_COLORS.warmBrown,
  dining_room: MUTED_ROOM_COLORS.sand,
  bathroom: MUTED_ROOM_COLORS.deepBlueGray,
  toilet: MUTED_ROOM_COLORS.deepBlueGray,
  study: MUTED_ROOM_COLORS.plum,
  office: MUTED_ROOM_COLORS.slateBlue,
  open_workspace: MUTED_ROOM_COLORS.slateBlue,
  meeting_room: MUTED_ROOM_COLORS.plum,
  conference_room: MUTED_ROOM_COLORS.slateBlue,
  reception: MUTED_ROOM_COLORS.sand,
  waiting_room: MUTED_ROOM_COLORS.sand,
  consultation_room: MUTED_ROOM_COLORS.sageGreen,
  lobby: MUTED_ROOM_COLORS.graphiteGray,
  hallway: MUTED_ROOM_COLORS.charcoal,
  corridor: MUTED_ROOM_COLORS.charcoal,
  balcony: MUTED_ROOM_COLORS.tealGray,
  utility: MUTED_ROOM_COLORS.charcoal,
  utility_room: MUTED_ROOM_COLORS.charcoal,
  storage: MUTED_ROOM_COLORS.charcoal,
  store_room: MUTED_ROOM_COLORS.charcoal,
  pantry: MUTED_ROOM_COLORS.warmBrown,
  pooja_room: MUTED_ROOM_COLORS.plum,
  garage: MUTED_ROOM_COLORS.graphiteGray,
  entry: MUTED_ROOM_COLORS.sand,
  stairs: MUTED_ROOM_COLORS.sand,
}

/** Non-room object types keep structural, near-neutral colors. */
const OBJECT_TYPE_COLORS: Record<string, string> = {
  wall: '#BDBDC0',
  door: '#9C8468',
  window: '#7C93A6',
  stair: MUTED_ROOM_COLORS.sand,
  floor: '#373738',
  open_space: '#3F444B',
  corridor: MUTED_ROOM_COLORS.charcoal,
  lift: '#5A5A5E',
  shaft: '#48484A',
  furniture: '#6E6659',
  column: '#909094',
  generic: MUTED_ROOM_COLORS.graphiteGray,
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
  public: { label: 'Public', color: MUTED_ROOM_COLORS.slateBlue },
  private: { label: 'Private', color: MUTED_ROOM_COLORS.sageGreen },
  collaborative: { label: 'Collaborative', color: MUTED_ROOM_COLORS.plum },
  service: { label: 'Service', color: MUTED_ROOM_COLORS.warmBrown },
  circulation: { label: 'Circulation', color: MUTED_ROOM_COLORS.graphiteGray },
  utility: { label: 'Utility', color: MUTED_ROOM_COLORS.charcoal },
}
