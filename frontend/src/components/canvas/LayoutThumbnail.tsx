import { useMemo } from 'react'
import type { CanvasFloor, Room } from '../../store/canvasStore'
import { groundFloorShapes, type PlanShape } from '../projects/PlanThumbnail'
import { EDITOR_PALETTE } from './editorPalette'

interface LayoutThumbnailProps {
  rooms: Room[]
  floors?: CanvasFloor[]
  className?: string
}

/** The ground floor's spaces (rotation-aware, polygon outlines kept) and a
 * padded view box around them. */
function thumbnailGeometry(rooms: Room[], floors?: CanvasFloor[]) {
  const shapes = groundFloorShapes(rooms)
  const levels = rooms.map((room) => room.floorLevel ?? 0)
  const groundLevel = levels.length > 0 ? Math.min(...levels) : 0
  const footprint = floors?.find((floor) => floor.level === groundLevel)?.footprint

  let minX = footprint ? footprint.x : Infinity
  let minZ = footprint ? footprint.z : Infinity
  let maxX = footprint ? footprint.x + footprint.w : -Infinity
  let maxZ = footprint ? footprint.z + footprint.d : -Infinity
  for (const shape of shapes) {
    for (const p of shape.points) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
    }
  }
  if (!Number.isFinite(minX)) {
    return { shapes, bounds: { x: 0, z: 0, w: 10, d: 10 } }
  }
  const pad = Math.max((maxX - minX) * 0.06, 0.4)
  return {
    shapes,
    bounds: { x: minX - pad, z: minZ - pad, w: maxX - minX + pad * 2, d: maxZ - minZ + pad * 2 },
  }
}

const n = (value: number) => Number(value.toFixed(3))
const pointsAttr = (points: PlanShape['points']) => points.map((p) => `${n(p.x)},${n(p.z)}`).join(' ')

/**
 * Mini 2D plan snapshot rendered straight from layout data — the shared
 * preview primitive for anywhere the UI wants to show "what this layout
 * looks like" without a live canvas: generation alternatives today;
 * version cards, share previews, and dashboard thumbnails once their
 * APIs expose layout JSON client-side. Draws the lowest floor's spaces
 * in the muted room palette on a dark sheet, so previews read as small
 * architectural drawings rather than noisy screenshots.
 */
export function LayoutThumbnail({ rooms, floors, className }: LayoutThumbnailProps) {
  const { shapes, bounds } = useMemo(() => thumbnailGeometry(rooms, floors), [rooms, floors])

  const stroke = Math.max(bounds.w, bounds.d) * 0.006

  return (
    <svg
      viewBox={`${bounds.x} ${bounds.z} ${bounds.w} ${bounds.d}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={className}
      data-testid="layout-thumbnail"
    >
      <rect
        x={bounds.x}
        y={bounds.z}
        width={bounds.w}
        height={bounds.d}
        fill={EDITOR_PALETTE.planSheetEnd}
      />
      {shapes.map((shape) => (
        <polygon
          key={shape.id}
          points={pointsAttr(shape.points)}
          fill={shape.color}
          fillOpacity={0.85}
          stroke={EDITOR_PALETTE.planFrame}
          strokeOpacity={0.5}
          strokeWidth={stroke}
        />
      ))}
    </svg>
  )
}

/**
 * The same drawing as a standalone SVG data URL, for the project card's
 * preview. Drawn from the plan data, so it never depends on which view (or
 * which canvas) happens to be on screen when the project is saved.
 */
export function layoutThumbnailDataUrl(rooms: Room[], floors?: CanvasFloor[]): string | null {
  const { shapes, bounds } = thumbnailGeometry(rooms, floors)
  if (shapes.length === 0) return null
  const stroke = Math.max(bounds.w, bounds.d) * 0.006
  const rects = shapes
    .map(
      (shape) =>
        `<polygon points="${pointsAttr(shape.points)}" fill="${shape.color}" fill-opacity="0.85" ` +
        `stroke="${EDITOR_PALETTE.planFrame}" stroke-opacity="0.5" stroke-width="${n(stroke)}"/>`,
    )
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(bounds.x)} ${n(bounds.z)} ${n(bounds.w)} ${n(bounds.d)}" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="${n(bounds.x)}" y="${n(bounds.z)}" width="${n(bounds.w)}" height="${n(bounds.d)}" fill="${EDITOR_PALETTE.planSheetEnd}"/>` +
    rects +
    '</svg>'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
