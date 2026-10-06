/**
 * What a hand-placed room is for. Values are layout-engine room types (each
 * resolves in backend/app/services/catalog/space_catalog.py resolve_alias);
 * 'room' is the unassigned default a placed room starts with.
 */
export const ROOM_USES: { value: string; label: string }[] = [
  { value: 'room', label: 'Unassigned' },
  { value: 'entry', label: 'Entry' },
  { value: 'living_room', label: 'Living room' },
  { value: 'dining', label: 'Dining' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'master_bedroom', label: 'Master bedroom' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'study', label: 'Study' },
  { value: 'utility', label: 'Utility' },
  { value: 'balcony', label: 'Balcony' },
  { value: 'pooja_room', label: 'Pooja room' },
  { value: 'corridor', label: 'Corridor' },
  { value: 'garage', label: 'Garage' },
]

export function roomUseLabel(value: string): string {
  const known = ROOM_USES.find((use) => use.value === value)
  if (known) return value === 'room' ? 'Room' : known.label
  const words = value.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A label the app gave (not one the user typed): "Room", "Kitchen", "Kitchen 2". */
export function isDefaultLabel(label: string, roomType: unknown): boolean {
  const base = label.replace(/\s+\d+$/, '')
  return base === 'Room' || (typeof roomType === 'string' && base === roomUseLabel(roomType))
}
