/**
 * Housing inside a mass (roadmap P3). Mirrors backend/app/schemas/housing.py.
 * The API speaks plan coordinates {x, y} (y = south); the canvas uses {x, z}.
 * A mass's latest fill is stored in layoutMetadata.housing[massId].
 */
import type { LayoutPlan, Vertex } from '../types/contracts'

export type UnitType = 'studio' | '1bhk' | '2bhk' | '3bhk' | '4bhk'

export const UNIT_TYPES: UnitType[] = ['studio', '1bhk', '2bhk', '3bhk', '4bhk']

export interface UnitMixEntry {
  unit_type: UnitType
  /** Target share of units, 0..1 (normalised by the server). */
  share: number
}

export interface HousingUnit {
  id: string
  floor: number
  unit_type: UnitType
  outline: Vertex[]
  area_m2: number
  plan: LayoutPlan
  locked: boolean
}

export interface HousingFillRequest {
  footprint: Vertex[]
  floors: number
  floor_height_m: number
  mix: UnitMixEntry[]
  facing?: 'north' | 'south' | 'east' | 'west' | null
  corridor_width_m?: number
  locked_units?: HousingUnit[]
}

export interface HousingYield {
  total_units: number
  units_by_type: Record<string, number>
  mix_achieved: Record<string, number>
  gfa_m2: number
  nsa_m2: number
  efficiency: number
}

export interface HousingFillResponse {
  units: HousingUnit[]
  cores: Vertex[][]
  corridors: Vertex[][]
  yield: HousingYield
  warnings: string[]
}

/** What a mass keeps in layoutMetadata.housing[massId]. */
export interface MassHousing {
  request: HousingFillRequest
  result: HousingFillResponse
}
