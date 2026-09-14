import type { Room } from '../../store/canvasStore'

export interface ModelBox {
  position: [number, number, number]
  size: [number, number, number]
}

/** Subtract hosted openings from a wall's local length/height rectangle.
 * Rendering only: the editable wall and door records are never changed. */
export function wallModelPieces(wall: Room, openings: Room[]): ModelBox[] {
  const horizontal = wall.size.w >= wall.size.d
  const length = horizontal ? wall.size.w : wall.size.d
  const thickness = horizontal ? wall.size.d : wall.size.w
  let pieces = [{ x0: -length / 2, x1: length / 2, y0: -wall.size.h / 2, y1: wall.size.h / 2 }]
  const angle = wall.rotation.y * Math.PI / 180
  for (const opening of openings) {
    if (opening.hostWallId !== wall.id || (opening.floorLevel ?? 0) !== (wall.floorLevel ?? 0)) continue
    const dx = opening.position.x - wall.position.x
    const dz = opening.position.z - wall.position.z
    const center = horizontal
      ? dx * Math.cos(angle) - dz * Math.sin(angle)
      : dx * Math.sin(angle) + dz * Math.cos(angle)
    const width = Math.max(opening.size.w, opening.size.d)
    const heightCenter = opening.position.y - wall.position.y
    const cut = { x0: center - width / 2, x1: center + width / 2, y0: heightCenter - opening.size.h / 2, y1: heightCenter + opening.size.h / 2 }
    pieces = pieces.flatMap((piece) => {
      const x0 = Math.max(piece.x0, cut.x0), x1 = Math.min(piece.x1, cut.x1)
      const y0 = Math.max(piece.y0, cut.y0), y1 = Math.min(piece.y1, cut.y1)
      if (x1 <= x0 || y1 <= y0) return [piece]
      return [
        { ...piece, x1: x0 }, { ...piece, x0: x1 },
        { x0, x1, y0: piece.y0, y1: y0 }, { x0, x1, y0: y1, y1: piece.y1 },
      ].filter((part) => part.x1 - part.x0 > 0.001 && part.y1 - part.y0 > 0.001)
    })
  }
  return pieces.map((piece) => {
    const center = (piece.x0 + piece.x1) / 2
    return {
      position: [horizontal ? center : 0, (piece.y0 + piece.y1) / 2, horizontal ? 0 : center],
      size: [horizontal ? piece.x1 - piece.x0 : thickness, piece.y1 - piece.y0, horizontal ? thickness : piece.x1 - piece.x0],
    }
  })
}
