import type { Room } from '../../store/canvasStore'
import type { CanvasViewMode } from '../../store/canvasStore'

/**
 * Every view renders the same object set — 2D, 3D, and the derived lenses
 * must never disagree about what exists.
 */
export function shouldRenderCanvasObject(_room: Room, _viewMode: CanvasViewMode) {
  return true
}
