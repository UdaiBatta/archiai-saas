import { useState } from 'react'

import type { ExamplePlan } from '../../constants/examplePlan'
import { EDITOR_PALETTE, ZONE_META } from '../canvas/editorPalette'
import { zoneForRoom } from '../canvas/zoneModel'

/**
 * Draws a real generated plan (not a mock-up): rooms coloured by zone,
 * solid walls, open-plan edges left open, doors as gaps, and the yard
 * around the house. Hovering a room names it with its size.
 */
export function ExamplePlanDrawing({ plan }: { plan: ExamplePlan['plan'] }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const { width_m: w, depth_m: d } = plan.plot
  const pad = 0.6
  const walls = new Map(plan.walls.map((wall) => [wall.id, wall]))
  const room = plan.rooms.find((r) => r.id === hovered)

  return (
    <figure className="m-0">
      <svg
        viewBox={`${-pad} ${-pad} ${w + pad * 2} ${d + pad * 2}`}
        role="img"
        aria-label={`Generated floor plan: ${plan.rooms.map((r) => r.label).join(', ')}`}
        className="mx-auto block max-h-[26rem] w-full"
      >
        <rect x={0} y={0} width={w} height={d} fill="none" stroke={EDITOR_PALETTE.planGrid} strokeWidth={0.06} strokeDasharray="0.25 0.2" />
        {plan.footprint && (
          <text x={w - 0.15} y={d - 0.2} textAnchor="end" fontSize={0.42} fill={EDITOR_PALETTE.dimension}>
            yard
          </text>
        )}
        {plan.rooms.map((r) => {
          const zone = zoneForRoom({ objectType: 'room', roomType: r.type, label: r.label })
          const active = hovered === r.id
          return (
            <g key={r.id} onPointerEnter={() => setHovered(r.id)} onPointerLeave={() => setHovered(null)}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={ZONE_META[zone].color}
                fillOpacity={active ? 0.95 : 0.6}
              />
              {r.w >= 2 && r.h >= 1.1 && (
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.min(0.46, r.w / 7)}
                  fontWeight={600}
                  className="fill-ink"
                  pointerEvents="none"
                >
                  {r.label}
                </text>
              )}
            </g>
          )
        })}
        {plan.walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.x1}
            y1={wall.y1}
            x2={wall.x2}
            y2={wall.y2}
            stroke={wall.kind === 'open' ? EDITOR_PALETTE.dimension : EDITOR_PALETTE.planFrame}
            strokeWidth={wall.kind === 'open' ? 0.04 : 0.16}
            strokeDasharray={wall.kind === 'open' ? '0.2 0.18' : undefined}
            strokeLinecap="square"
            pointerEvents="none"
          />
        ))}
        {plan.doors.map((door) => {
          const wall = walls.get(door.wall_ref)
          if (!wall) return null
          const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1
          const ux = (wall.x2 - wall.x1) / length
          const uy = (wall.y2 - wall.y1) / length
          const x1 = wall.x1 + ux * door.offset
          const y1 = wall.y1 + uy * door.offset
          return (
            <line
              key={door.id}
              x1={x1}
              y1={y1}
              x2={x1 + ux * door.width}
              y2={y1 + uy * door.width}
              stroke={EDITOR_PALETTE.selection}
              strokeWidth={0.2}
              pointerEvents="none"
            />
          )
        })}
      </svg>
      <figcaption className="mt-2 flex min-h-[1.25rem] items-center justify-between gap-3 font-mono text-[11px] text-muted-light">
        <span>{room ? `${room.label} · ${room.w.toFixed(1)} × ${room.h.toFixed(1)} m` : 'Hover a room for its size'}</span>
        <span>
          plot {w} × {d} m
          {plan.footprint && ` · house ${plan.footprint.w.toFixed(1)} × ${plan.footprint.h.toFixed(1)} m`}
        </span>
      </figcaption>
    </figure>
  )
}
