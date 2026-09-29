import { PencilRuler } from 'lucide-react'

import { displayRoomColor } from '../canvas/editorPalette'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import type { Room } from '../../store/canvasStore'
import { quarterTurnPlanSize } from '../../utils/quarterTurn'

// Faint drafting grid behind the plan and the empty state.
const GRID_STYLE = {
  backgroundImage:
    'linear-gradient(rgba(243,244,245,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(243,244,245,0.04) 1px, transparent 1px)',
  backgroundSize: '12px 12px',
}

function floorOf(room: Room): number {
  if (typeof room.floorLevel === 'number') return room.floorLevel
  const match = /(\d+)$/.exec(room.floorId ?? '')
  return match ? Number(match[1]) : 0
}

function isSpace(room: Room): boolean {
  return room.objectType === 'stair' || COMPONENT_REGISTRY[room.objectType]?.category === 'space'
}

export interface PlanShape {
  id: string
  color: string
  /** Outline in plan metres: x east, z south (so north is up on screen). */
  points: { x: number; z: number }[]
}

/**
 * The lowest floor's spaces as plan outlines. `position` is a room's centre
 * and `size` is in its own frame, so a quarter-turned room swaps w/d on plan;
 * polygon rooms keep their real outline instead of a bounding box.
 */
export function groundFloorShapes(rooms: Room[]): PlanShape[] {
  const spaces = rooms.filter(isSpace)
  if (spaces.length === 0) return []
  const ground = Math.min(...spaces.map(floorOf))
  return spaces
    .filter((room) => floorOf(room) === ground)
    .map((room) => {
      if (room.polygonVertices && room.polygonVertices.length >= 3) {
        return { id: room.id, color: displayRoomColor(room), points: room.polygonVertices }
      }
      const { w, d } = quarterTurnPlanSize(room.size, room.rotation?.y ?? 0)
      const x0 = room.position.x - w / 2
      const z0 = room.position.z - d / 2
      return {
        id: room.id,
        color: displayRoomColor(room),
        points: [
          { x: x0, z: z0 },
          { x: x0 + w, z: z0 },
          { x: x0 + w, z: z0 + d },
          { x: x0, z: z0 + d },
        ],
      }
    })
}

function EmptyPlan({ loading }: { loading?: boolean }) {
  return (
    <div
      className={`flex h-36 w-full flex-col items-center justify-center gap-2 bg-graphite-900 text-muted-light ${loading ? 'animate-pulse' : ''}`}
      style={GRID_STYLE}
      data-testid="plan-thumbnail-empty"
    >
      {!loading && (
        <>
          <span className="flex size-9 items-center justify-center rounded-full border border-ink/10 bg-graphite-800">
            <PencilRuler size={16} aria-hidden="true" />
          </span>
          <span className="text-xs font-medium">No layout yet</span>
        </>
      )}
    </div>
  )
}

interface PlanThumbnailProps {
  /** The project's latest layout rooms; null/empty shows the empty state. */
  rooms?: Room[] | null
  loading?: boolean
}

/** A miniature floor plan of the ground floor, fitted and centred in the card. */
export function PlanThumbnail({ rooms, loading }: PlanThumbnailProps) {
  const shapes = rooms ? groundFloorShapes(rooms) : []
  if (loading || shapes.length === 0) return <EmptyPlan loading={loading} />

  const xs = shapes.flatMap((s) => s.points.map((p) => p.x))
  const zs = shapes.flatMap((s) => s.points.map((p) => p.z))
  const minX = Math.min(...xs)
  const minZ = Math.min(...zs)
  const w = Math.max(...xs) - minX
  const d = Math.max(...zs) - minZ
  const pad = Math.max(w, d) * 0.12
  const n = (v: number) => Number(v.toFixed(3))

  return (
    <div className="h-36 w-full bg-graphite-900" style={GRID_STYLE}>
      <svg
        viewBox={`${n(minX - pad)} ${n(minZ - pad)} ${n(w + 2 * pad)} ${n(d + 2 * pad)}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
        data-testid="plan-thumbnail"
      >
        {shapes.map((shape) => (
          <polygon
            key={shape.id}
            points={shape.points.map((p) => `${n(p.x)},${n(p.z)}`).join(' ')}
            fill={shape.color}
            stroke="#0B0A0A"
            strokeWidth={1.25}
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  )
}
