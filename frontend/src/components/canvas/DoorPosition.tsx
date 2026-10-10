import { useRef } from 'react'
import { useCanvasStore, type Room } from '../../store/canvasStore'
import { snapDoorToWall, wallPoint } from '../../store/connections'

/** Slide a door along its wall: the spot is kept as that pair's door connection. */
export function DoorPosition({ door }: { door: Room }) {
  const wall = useCanvasStore((s) => s.rooms.find((r) => r.id === door.hostWallId))
  const updateRoom = useCanvasStore((s) => s.updateRoom)
  const start = useRef<Room['position'] | null>(null)
  if (!wall) return null

  const at = snapDoorToWall(door, wall, door.position).at
  const moveTo = (fraction: number, commit: boolean) => {
    const point = wallPoint(wall, fraction)
    updateRoom(
      door.id,
      { position: { ...door.position, ...point } },
      commit ? { action: 'object.moved', previousValue: { ...door, position: start.current ?? door.position } } : { log: false },
    )
  }
  const begin = () => {
    if (!start.current) start.current = { ...door.position }
  }
  const end = (event: { currentTarget: HTMLInputElement }) => {
    if (!start.current) return
    moveTo(Number(event.currentTarget.value), true)
    start.current = null
  }

  return (
    <label className="flex flex-col gap-1 rounded-lg border border-ink/10 bg-graphite-800/60 p-3">
      <span className="flex justify-between text-[9px] font-medium uppercase tracking-wide text-muted-light">
        Position along wall
        <span className="font-mono normal-case tracking-normal text-muted">{Math.round(at * 100)}%</span>
      </span>
      <input
        type="range"
        aria-label="Door position along wall"
        min={0}
        max={1}
        step={0.01}
        value={at}
        onPointerDown={begin}
        onKeyDown={begin}
        onChange={(event) => {
          begin()
          moveTo(Number(event.target.value), false)
        }}
        onPointerUp={end}
        onKeyUp={end}
        className="accent-accent"
      />
    </label>
  )
}
