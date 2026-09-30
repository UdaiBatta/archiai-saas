import { quarterTurnPlanSize } from '../utils/quarterTurn'

/** Rooms closer than this snap together: a gap or overlap this small is
 * never meant, and it would otherwise build two walls side by side. */
export const EDGE_SNAP = 0.45

interface Box {
  position: { x: number; y: number; z: number }
  size: { w: number; h: number; d: number }
  rotation: { y: number }
}

type Span = [number, number]

const spans = (box: Box): { x: Span; z: Span } => {
  const { w, d } = quarterTurnPlanSize(box.size, box.rotation.y)
  return {
    x: [box.position.x - w / 2, box.position.x + w / 2],
    z: [box.position.z - d / 2, box.position.z + d / 2],
  }
}

/** Smallest shift within EDGE_SNAP that lands `edge` on one of `targets`. */
const nearest = (edges: number[], targets: number[]): number => {
  let best = 0
  let bestAbs = EDGE_SNAP
  for (const edge of edges) {
    for (const target of targets) {
      const shift = target - edge
      if (Math.abs(shift) < bestAbs && Math.abs(shift) > 1e-6) {
        best = shift
        bestAbs = Math.abs(shift)
      }
    }
  }
  return best
}

/**
 * Snap a moved or resized room's edges onto its neighbours' edges on the same
 * floor. A move shifts the whole room; a resize moves only the edges that
 * changed, so the opposite side stays put.
 */
export function snapToNeighbours<T extends Box>(next: T, previous: Box, others: Box[]): T {
  const now = spans(next)
  const near = (a: Span, b: Span) => a[0] < b[1] + EDGE_SNAP && b[0] < a[1] + EDGE_SNAP
  const targets = { x: [] as number[], z: [] as number[] }
  for (const other of others) {
    const s = spans(other)
    if (near(now.z, s.z)) targets.x.push(...s.x)
    if (near(now.x, s.x)) targets.z.push(...s.z)
  }
  if (!targets.x.length && !targets.z.length) return next

  const before = spans(previous)
  const resized = next.size.w !== previous.size.w || next.size.d !== previous.size.d
  const out = { x: [...now.x] as Span, z: [...now.z] as Span }
  for (const axis of ['x', 'z'] as const) {
    if (!resized) {
      const shift = nearest(now[axis], targets[axis])
      out[axis] = [now[axis][0] + shift, now[axis][1] + shift]
      continue
    }
    for (const side of [0, 1] as const) {
      if (Math.abs(now[axis][side] - before[axis][side]) < 1e-6) continue
      out[axis][side] = now[axis][side] + nearest([now[axis][side]], targets[axis])
    }
  }
  if (out.x.every((v, i) => v === now.x[i]) && out.z.every((v, i) => v === now.z[i])) return next
  const worldW = out.x[1] - out.x[0]
  const worldD = out.z[1] - out.z[0]
  if (worldW <= EDGE_SNAP || worldD <= EDGE_SNAP) return next
  const local = quarterTurnPlanSize({ w: worldW, d: worldD }, next.rotation.y)
  return {
    ...next,
    position: { ...next.position, x: (out.x[0] + out.x[1]) / 2, z: (out.z[0] + out.z[1]) / 2 },
    size: { ...next.size, w: local.w, d: local.d },
  }
}
