import { useMemo } from 'react'
import type { CanvasFloor, Room } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { EDITOR_PALETTE, displayRoomColor } from './editorPalette'

interface LayoutThumbnailProps {
  rooms: Room[]
  floors?: CanvasFloor[]
  className?: string
}

/** The ground floor's spaces and a padded view box around them. */
function thumbnailGeometry(rooms: Room[], floors?: CanvasFloor[]) {
  const levels = rooms.map((room) => room.floorLevel ?? 0)
  const groundLevel = levels.length > 0 ? Math.min(...levels) : 0
  const floorSpaces = rooms.filter(
    (room) =>
      (room.floorLevel ?? 0) === groundLevel &&
      COMPONENT_REGISTRY[room.objectType]?.category === 'space',
  )
  const footprint = floors?.find((floor) => floor.level === groundLevel)?.footprint

  let minX = footprint ? footprint.x : Infinity
  let minZ = footprint ? footprint.z : Infinity
  let maxX = footprint ? footprint.x + footprint.w : -Infinity
  let maxZ = footprint ? footprint.z + footprint.d : -Infinity
  for (const room of floorSpaces) {
    minX = Math.min(minX, room.position.x - room.size.w / 2)
    maxX = Math.max(maxX, room.position.x + room.size.w / 2)
    minZ = Math.min(minZ, room.position.z - room.size.d / 2)
    maxZ = Math.max(maxZ, room.position.z + room.size.d / 2)
  }
  if (!Number.isFinite(minX)) {
    return { spaces: floorSpaces, bounds: { x: 0, z: 0, w: 10, d: 10 } }
  }
  const pad = Math.max((maxX - minX) * 0.06, 0.4)
  return {
    spaces: floorSpaces,
    bounds: {
      x: minX - pad,
      z: minZ - pad,
      w: maxX - minX + pad * 2,
      d: maxZ - minZ + pad * 2,
    },
  }
}

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
  const { spaces, bounds } = useMemo(() => thumbnailGeometry(rooms, floors), [rooms, floors])

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
      {spaces.map((room) => (
        <rect
          key={room.id}
          x={room.position.x - room.size.w / 2}
          y={room.position.z - room.size.d / 2}
          width={room.size.w}
          height={room.size.d}
          fill={displayRoomColor(room)}
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
  const { spaces, bounds } = thumbnailGeometry(rooms, floors)
  if (spaces.length === 0) return null
  const stroke = Math.max(bounds.w, bounds.d) * 0.006
  const n = (value: number) => Number(value.toFixed(3))
  const rects = spaces
    .map(
      (room) =>
        `<rect x="${n(room.position.x - room.size.w / 2)}" y="${n(room.position.z - room.size.d / 2)}" ` +
        `width="${n(room.size.w)}" height="${n(room.size.d)}" fill="${displayRoomColor(room)}" fill-opacity="0.85" ` +
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
