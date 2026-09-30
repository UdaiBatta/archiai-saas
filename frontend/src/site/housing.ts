/**
 * Housing (P3) logic: build the fill request from a mass, tell when a stored
 * fill no longer matches its mass, locks, and the yield's mix drift.
 * No React, no store.
 */
import { streetDirection } from './siteEdit'
import type { Mass, SitePoint } from './siteTypes'
import {
  UNIT_TYPES,
  type HousingFillRequest,
  type HousingUnit,
  type MassHousing,
  type UnitMixEntry,
  type UnitType,
} from './housingTypes'
import type { Vertex } from '../types/contracts'

export const DEFAULT_CORRIDOR_M = 1.5
/** Percent per unit type; what the mix editor starts from. */
export const DEFAULT_MIX_PCT: Record<UnitType, number> = { studio: 10, '1bhk': 30, '2bhk': 40, '3bhk': 20, '4bhk': 0 }
/** Achieved share further than this from the target (percentage points) is flagged. */
export const DRIFT_WARN_PTS = 5
export const DRIFT_BAD_PTS = 10

export const UNIT_LABELS: Record<UnitType, string> = {
  studio: 'Studio',
  '1bhk': '1 BHK',
  '2bhk': '2 BHK',
  '3bhk': '3 BHK',
  '4bhk': '4 BHK',
}

/** Canvas {x, z} -> API plan {x, y}: y is z (both point south). */
export const toPlan = (points: SitePoint[]): Vertex[] => points.map((p) => ({ x: p.x, y: p.z }))

export const mixTotal = (pct: Record<UnitType, number>) => UNIT_TYPES.reduce((s, t) => s + (pct[t] || 0), 0)

/** Percentages -> the API's shares: zero rows dropped, the rest scaled to sum 1. */
export function normaliseMix(pct: Record<UnitType, number>): UnitMixEntry[] {
  const total = mixTotal(pct)
  if (total <= 0) return []
  return UNIT_TYPES.filter((t) => pct[t] > 0).map((t) => ({ unit_type: t, share: pct[t] / total }))
}

/** The stored request's mix back as whole percentages for the editor. */
export function mixPct(mix: UnitMixEntry[] | undefined): Record<UnitType, number> {
  if (!mix?.length) return { ...DEFAULT_MIX_PCT }
  const out = Object.fromEntries(UNIT_TYPES.map((t) => [t, 0])) as Record<UnitType, number>
  for (const entry of mix) out[entry.unit_type] = Math.round(entry.share * 100)
  return out
}

const FACING_OF: Record<string, HousingFillRequest['facing']> = {
  '0,-1': 'north',
  '0,1': 'south',
  '1,0': 'east',
  '-1,0': 'west',
}

/** Street side from the layout metadata (orientation block or the brief), if any. */
export function facingFrom(metadata: Record<string, unknown>): HousingFillRequest['facing'] {
  const dir = streetDirection(metadata)
  return dir ? FACING_OF[`${Math.round(dir.x) || 0},${Math.round(dir.z) || 0}`] ?? null : null
}

export function buildFillRequest(
  mass: Mass,
  options: { mixPct: Record<UnitType, number>; corridorM: number; facing: HousingFillRequest['facing']; locked?: HousingUnit[] },
): HousingFillRequest {
  return {
    footprint: toPlan(mass.footprint),
    floors: mass.floors,
    floor_height_m: mass.floorHeightM,
    mix: normaliseMix(options.mixPct),
    facing: options.facing ?? null,
    corridor_width_m: options.corridorM,
    // Locks above the (possibly lowered) top floor can't be honoured.
    locked_units: (options.locked ?? []).filter((u) => u.locked && u.floor < mass.floors),
  }
}

const samePoints = (a: Vertex[], b: Vertex[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p.x - b[i].x) < 1e-6 && Math.abs(p.y - b[i].y) < 1e-6)

/** The mass changed shape since it was filled (footprint, floors or floor height). */
export function isHousingStale(housing: MassHousing, mass: Mass): boolean {
  const r = housing.request
  return r.floors !== mass.floors || Math.abs(r.floor_height_m - mass.floorHeightM) > 1e-6 || !samePoints(r.footprint, toPlan(mass.footprint))
}

export const lockedUnits = (housing: MassHousing) => housing.result.units.filter((u) => u.locked)

export function toggleUnitLock(housing: MassHousing, unitId: string): MassHousing {
  return {
    ...housing,
    result: { ...housing.result, units: housing.result.units.map((u) => (u.id === unitId ? { ...u, locked: !u.locked } : u)) },
  }
}

/** Read `layoutMetadata.housing` defensively: entries without units are dropped. */
export function parseHousing(value: unknown): Record<string, MassHousing> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, MassHousing> = {}
  for (const [id, raw] of Object.entries(value as Record<string, MassHousing>)) {
    if (raw?.request && Array.isArray(raw.result?.units)) out[id] = raw
  }
  return out
}

export type DriftStatus = 'ok' | 'near' | 'over'

export interface MixRow {
  type: UnitType
  count: number
  /** 0..1 */
  target: number
  achieved: number
  status: DriftStatus
}

/** Per type: count, target vs achieved share, and how far it drifted. */
export function mixRows(housing: MassHousing): MixRow[] {
  const y = housing.result.yield
  const targets = new Map(normaliseMix(mixPct(housing.request.mix)).map((e) => [e.unit_type, e.share]))
  return UNIT_TYPES.flatMap((type) => {
    const target = targets.get(type) ?? 0
    const count = y.units_by_type[type] ?? 0
    if (!target && !count) return []
    const achieved = y.mix_achieved[type] ?? (y.total_units ? count / y.total_units : 0)
    const drift = Math.abs(achieved - target) * 100
    const status: DriftStatus = drift > DRIFT_BAD_PTS ? 'over' : drift > DRIFT_WARN_PTS ? 'near' : 'ok'
    return [{ type, count, target, achieved, status }]
  })
}
