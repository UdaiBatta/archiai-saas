/**
 * Shared architectural formatting — one rounding rule everywhere so
 * dimensions read consistently across the 2D plan, 3D labels, inspector,
 * status bar, and previews.
 *
 * Convention: lengths in metres with one decimal ("6.2 m"), areas in
 * square metres with one decimal ("29.8 m²"), dimension pairs as
 * "6.2 × 4.8 m". The tape-measure tool keeps two decimals separately —
 * it exists for precision; room readouts exist for legibility.
 */

export function formatMeters(value: number): string {
  return `${value.toFixed(1)} m`
}

export function formatDims(w: number, d: number): string {
  return `${w.toFixed(1)} × ${d.toFixed(1)} m`
}

export function formatArea(sqm: number): string {
  return `${sqm.toFixed(1)} m²`
}

/** Sun hours: up to two decimals, no trailing zeros ("6.75 h", "8.5 h", "0 h", "10 h"). */
export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))} h`
}

export function roomArea(size: { w: number; d: number }): number {
  return size.w * size.d
}

export function roomPerimeter(size: { w: number; d: number }): number {
  return 2 * (size.w + size.d)
}
