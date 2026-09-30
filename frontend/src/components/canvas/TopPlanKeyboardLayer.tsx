import { type Room, useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { formatArea } from '../../utils/format'
import { roomPlanArea } from './topViewModel'
import { massGfa } from '../../site/massing'
import { useMassUi, useSiteAndMasses } from '../../site/massStore'

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
 * Massing blocks follow the rooms, named with their floors and GFA.
 */
export function TopPlanKeyboardLayer({ rooms, invalidRoomIds, onFocusRoom }: TopPlanKeyboardLayerProps) {
  const selectedId = useCanvasStore((s) => s.selectedId)
  const selectRoom = useCanvasStore((s) => s.selectRoom)
  const { masses } = useSiteAndMasses()
  const selectedMassId = useMassUi((s) => s.selectedMassId)
  const selectMass = useMassUi((s) => s.select)
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
              onClick={() => {
                selectMass(null)
                selectRoom(room.id)
              }}
              onFocus={() => onFocusRoom(room.id)}
              onBlur={() => onFocusRoom(null)}
            />
          )
        })}
      {masses.map((mass) => (
        <button
          key={mass.id}
          type="button"
          data-testid={`plan-mass-${mass.id}`}
          aria-label={`${mass.name}, mass, ${mass.floors} floor${mass.floors === 1 ? '' : 's'}, GFA ${formatArea(massGfa(mass))}`}
          aria-pressed={selectedMassId === mass.id}
          onClick={() => {
            useCanvasStore.getState().deselectAll()
            selectMass(mass.id)
          }}
        />
      ))}
    </div>
  )
}
