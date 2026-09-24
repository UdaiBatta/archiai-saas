import { CanvasObjectType, Room, useCanvasStore } from '../../store/canvasStore'
import {
  COMPONENT_DEFINITIONS,
  COMPONENT_REGISTRY,
  componentTypeToRoomType,
} from '../../store/componentRegistry'
import { formatArea, formatMeters, roomArea, roomPerimeter } from '../../utils/format'
import { canonicalQuarterTurn } from '../../utils/quarterTurn'

interface InspectorPropertiesProps {
  room: Room
}

const FIELD_CLASS =
  'w-full rounded-md border border-ink/10 bg-[#1d1e1f] px-2 py-1.5 font-mono text-[11px] tabular-nums text-ink focus:border-accent-bright/70 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink/5'

const LABEL_CLASS = 'text-[9px] font-medium uppercase tracking-wide text-muted-light'

/**
 * Compact selected-object editor. Geometry stays immediately visible while
 * identity, level, position, height, and rotation remain available through
 * progressive disclosure. All mutations still use the shared canvas store.
 */
export function InspectorProperties({ room }: InspectorPropertiesProps) {
  const floors = useCanvasStore((s) => s.floors)
  const updateRoom = useCanvasStore((s) => s.updateRoom)
  const deleteRoom = useCanvasStore((s) => s.deleteRoom)
  const duplicateRoom = useCanvasStore((s) => s.duplicateRoom)

  const definition = COMPONENT_REGISTRY[room.objectType]
  const roomQuarterTurnOnly = room.objectType === 'room'

  const rotateY = (degrees: number) => {
    if (!definition.canRotate) return
    const nextY = roomQuarterTurnOnly
      ? canonicalQuarterTurn(room.rotation.y + degrees)
      : ((room.rotation.y + degrees) % 360 + 360) % 360
    updateRoom(
      room.id,
      {
        rotation: roomQuarterTurnOnly
          ? { x: 0, y: nextY, z: 0 }
          : { ...room.rotation, y: nextY },
      },
      { action: 'object.rotated', previousValue: room.rotation },
    )
  }

  const updateSize = (axis: 'w' | 'd' | 'h', value: string) => {
    const next = Number(value)
    if (!Number.isFinite(next)) return
    updateRoom(room.id, { size: { ...room.size, [axis]: next } })
  }

  return (
    <div className="flex flex-col gap-3">
      <section
        data-testid="geometry-card"
        className="rounded-lg border border-ink/10 bg-[#232425]/80 p-3"
      >
        <h3 className="mb-2.5 text-[11px] font-semibold text-ink">Geometry</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Width (m)</span>
            <input
              type="number"
              min={definition.minSize.w}
              step="0.1"
              aria-label="Width"
              className={FIELD_CLASS}
              value={room.size.w}
              disabled={!definition.canResize}
              onChange={(event) => updateSize('w', event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Depth (m)</span>
            <input
              type="number"
              min={definition.minSize.d}
              step="0.1"
              aria-label="Depth"
              className={FIELD_CLASS}
              value={room.size.d}
              disabled={!definition.canResize}
              onChange={(event) => updateSize('d', event.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Area (m2)</span>
            <output className="rounded-md border border-ink/10 bg-[#1d1e1f]/65 px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted">
              {formatArea(roomArea(room.size))}
            </output>
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Perimeter (m)</span>
            <output className="rounded-md border border-ink/10 bg-[#1d1e1f]/65 px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted">
              {formatMeters(roomPerimeter(room.size))}
            </output>
          </div>
        </div>
      </section>

      <details className="group rounded-lg border border-ink/10 bg-[#232425]/55">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-muted hover:text-ink">
          Advanced properties
          <span aria-hidden="true" className="text-muted-light transition-transform group-open:rotate-180">v</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-ink/10 p-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Label</span>
            <input
              type="text"
              aria-label="Object label"
              className={FIELD_CLASS}
              value={room.label}
              onChange={(event) => {
                updateRoom(
                  room.id,
                  { label: event.target.value },
                  { action: 'object.renamed', previousValue: room.label },
                )
              }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Type</span>
            <select
              aria-label="Object type"
              className={FIELD_CLASS}
              value={room.objectType}
              onChange={(event) => {
                const objectType = event.target.value as CanvasObjectType
                updateRoom(
                  room.id,
                  { objectType, roomType: componentTypeToRoomType(objectType) },
                  { action: 'object.updated', previousValue: room.objectType },
                )
              }}
            >
              {COMPONENT_DEFINITIONS.filter((type) => type.canCreate).map((type) => (
                <option key={type.type} value={type.type}>{type.label}</option>
              ))}
            </select>
          </label>

          {floors.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLASS}>Floor</span>
              <select
                aria-label="Object floor"
                className={FIELD_CLASS}
                value={room.floorLevel ?? 0}
                onChange={(event) => {
                  const floor = floors.find((candidate) => candidate.level === Number(event.target.value))
                  if (!floor) return
                  updateRoom(
                    room.id,
                    {
                      floorId: floor.id,
                      floorLevel: floor.level,
                      position: { ...room.position, y: floor.elevation + room.size.h / 2 },
                    },
                    { action: 'object.updated', previousValue: room.floorLevel ?? 0 },
                  )
                }}
              >
                {floors.map((floor) => (
                  <option key={floor.id} value={floor.level}>{floor.name}</option>
                ))}
              </select>
            </label>
          )}

          <div>
            <p className={LABEL_CLASS}>Position</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['x', 'z'] as const).map((axis) => (
                <label key={axis} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-muted">{axis}</span>
                  <input
                    type="number"
                    step="0.1"
                    aria-label={`Position ${axis.toUpperCase()}`}
                    className={FIELD_CLASS}
                    value={room.position[axis]}
                    disabled={!definition.canMove}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      if (Number.isFinite(next)) {
                        updateRoom(room.id, { position: { ...room.position, [axis]: next } })
                      }
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLASS}>Height (m)</span>
            <input
              type="number"
              min={definition.minSize.h}
              step="0.1"
              aria-label="Height"
              className={FIELD_CLASS}
              value={room.size.h}
              disabled={!definition.canResize}
              onChange={(event) => updateSize('h', event.target.value)}
            />
          </label>

          <div>
            <p className={LABEL_CLASS}>Rotation</p>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <label key={axis} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-muted">{axis}</span>
                  <input
                    type="number"
                    min={roomQuarterTurnOnly && axis === 'y' ? 0 : undefined}
                    max={roomQuarterTurnOnly && axis === 'y' ? 270 : undefined}
                    step={roomQuarterTurnOnly && axis === 'y' ? 90 : undefined}
                    aria-label={`Rotation ${axis.toUpperCase()}`}
                    className={FIELD_CLASS}
                    value={
                      roomQuarterTurnOnly
                        ? axis === 'y'
                          ? canonicalQuarterTurn(room.rotation.y)
                          : 0
                        : room.rotation[axis]
                    }
                    disabled={
                      !definition.canRotate || (roomQuarterTurnOnly && axis !== 'y')
                    }
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      if (!Number.isFinite(next)) return
                      updateRoom(
                        room.id,
                        {
                          rotation: roomQuarterTurnOnly
                            ? { x: 0, y: canonicalQuarterTurn(next), z: 0 }
                            : { ...room.rotation, [axis]: next },
                        },
                        { action: 'object.rotated', previousValue: room.rotation },
                      )
                    }}
                  />
                </label>
              ))}
            </div>
            {roomQuarterTurnOnly && (
              <p className="mt-1.5 text-[9px] leading-4 text-muted-light">
                Rooms stay axis-aligned and rotate in 90-degree steps.
              </p>
            )}
            <div className="mt-2 grid grid-cols-3 gap-1" aria-label="Quick rotate Y controls">
              {(roomQuarterTurnOnly ? [-90, 90, 180] : [-15, 15, 90]).map((degrees) => (
                <button
                  key={degrees}
                  type="button"
                  disabled={!definition.canRotate}
                  className="rounded-md border border-ink/10 px-2 py-1 text-[10px] font-medium text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                  onClick={() => rotateY(degrees)}
                >
                  {degrees > 0 ? '+' : ''}{degrees} deg
                </button>
              ))}
            </div>
          </div>
        </div>
      </details>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="rounded-md border border-ink/10 px-3 py-2 text-[11px] font-medium text-muted hover:bg-ink/5 hover:text-ink"
          onClick={() => duplicateRoom(room.id)}
        >
          Duplicate
        </button>
        <button
          className="rounded-md border border-danger/30 px-3 py-2 text-[11px] font-medium text-danger hover:bg-danger/10"
          onClick={() => deleteRoom(room.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
