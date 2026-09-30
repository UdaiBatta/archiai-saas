/**
 * "Draw site" as a tiny state machine: click adds a corner, clicking the
 * first corner or double-clicking closes (3+ corners), Escape cancels.
 */
import type { SitePoint } from './siteTypes'

export type DrawEvent =
  | { type: 'click'; point: SitePoint; /** Snap radius in metres (screen-constant). */ tolerance: number }
  | { type: 'doubleClick' }
  | { type: 'cancel' }

export type DrawResult =
  | { status: 'drawing'; points: SitePoint[] }
  | { status: 'closed'; boundary: SitePoint[] }
  | { status: 'cancelled' }

const near = (a: SitePoint, b: SitePoint, tolerance: number) => Math.hypot(a.x - b.x, a.z - b.z) <= tolerance

export function drawStep(points: SitePoint[], event: DrawEvent): DrawResult {
  switch (event.type) {
    case 'cancel':
      return { status: 'cancelled' }
    case 'doubleClick':
      // The double-click's own clicks already landed (deduped) as the last corner.
      return points.length >= 3 ? { status: 'closed', boundary: points } : { status: 'drawing', points }
    case 'click': {
      const { point, tolerance } = event
      if (points.length >= 3 && near(point, points[0], tolerance)) return { status: 'closed', boundary: points }
      const last = points[points.length - 1]
      if (last && near(point, last, tolerance)) return { status: 'drawing', points }
      return { status: 'drawing', points: [...points, point] }
    }
  }
}
