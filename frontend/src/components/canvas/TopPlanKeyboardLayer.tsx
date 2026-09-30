import { type Room, useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { formatArea } from '../../utils/format'
import { roomPlanArea } from './topViewModel'

interface TopPlanKeyboardLayerProps {
  rooms: Room[]
  invalidRoomIds: Set<string>
  onFocusRoom: (roomId: string | null) => void
}

/**
 * Keyboard access to the Top view: one visually-hidden button per
 * selectable object, in plan order, so Tab walks the rooms and Enter/Space
 * selects (native button behaviour). The canvas draws the focus ring for the
 * focused room; Escape is the shared canvas shortcut and clears selection.
 */
export function TopPlanKeyboardLayer({ rooms, invalidRoomIds, onFocusRoom }: TopPlanKeyboardLayerProps) {
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  return (
    <div role="group" aria-label="Plan objects" className="sr-only">
      {rooms
        .filter((room) => COMPONENT_REGISTRY[room.objectType].canSelect)
        .map((room) => {
          const definition = COMPONENT_REGISTRY[room.objectType]
          const area = definition.category === 'space' ? `, ${formatArea(roomPlanArea(room))}` : ''
          return (
            <button
              key={room.id}
              type="button"
              data-testid={`plan-object-${room.id}`}
              aria-label={`${room.label}, ${definition.label}${area}`}
              aria-pressed={selectedId === room.id}
              aria-invalid={invalidRoomIds.has(room.id) || undefined}
              onClick={() => selectRoom(room.id)}
              onFocus={() => onFocusRoom(room.id)}
              onBlur={() => onFocusRoom(null)}
            />
          )
        })}
    </div>
  )
}
