/**
 * Hand-written TypeScript mirror of the backend MVP contracts (workflow Step 0.3):
 * backend/app/schemas/{requirements,layout_plan,quality_report}.py
 *
 * COORDINATE CONVENTION (same statement as layout_plan.py, never restated
 * differently): units are METERS, origin at the plot's NW corner, +x EAST,
 * +y SOUTH, north-up. Rotation is limited to 0 | 90 | 180 | 270.
 *
 * Keep field names snake_case to match the wire format exactly.
 */

export type BuildingType =
  | 'house' | 'apartment' | 'villa' | 'duplex' | 'clinic' | 'office' | 'other'

export type RoomType =
  | 'bedroom' | 'master_bedroom' | 'bathroom' | 'kitchen' | 'living_room'
  | 'dining' | 'balcony' | 'entry' | 'pooja_room' | 'study' | 'utility' | 'parking'

export type Facing = 'north' | 'south' | 'east' | 'west'

export interface RoomRequest { type: RoomType; count: number }
export interface SpaceRequest {
  space_type: string
  count: number
  size_hint?: 'small' | 'medium' | 'large' | 'xlarge' | null
  area_m2?: number | null
  priority?: number | null
  zone_guess?: 'public' | 'private' | 'semi_private' | 'service' | 'circulation' | 'outdoor' | 'technical' | null
  size_guess_m2?: number | null
  confidence?: number | null
}
export interface AdjacencyPref { room_a: string; room_b: string; strength: 'must' | 'should' }
export interface AvoidPair { room_a: string; room_b: string }
/** Straight-edge boundary/room-outline point (workflow Phase 8, polygon
 * boundary engine) - same meters/NW-origin convention as everything else
 * here. Curves are out of scope; a vertex list cannot encode one. */
export interface Vertex { x: number; y: number }

export interface PlotSpec { width_m: number | null; depth_m: number | null; boundary?: Vertex[] | null }

export interface RequirementsSpec {
  building_type: BuildingType
  floors: number
  accessibility_mode?: boolean
  rooms: RoomRequest[]
  spaces?: SpaceRequest[]
  adjacency: AdjacencyPref[]
  avoid_adjacency: AvoidPair[]
  plot: PlotSpec
  facing: Facing | null
  missing_info: string[]
}

export type Rotation = 0 | 90 | 180 | 270

export interface PlanPlot { width_m: number; depth_m: number; facing: Facing; boundary?: Vertex[] | null }

export interface PlanRoom {
  id: string
  type: string
  label: string
  x: number
  y: number
  w: number
  h: number
  rotation: Rotation
  floor?: number
  zone_id?: string
  /** Set only for a non-rectangular room (workflow Phase 8/10.2). When
   * present, x/y/w/h is the bounding box only - this is the real outline.
   * Rotation is always 0 for a polygon room (backend-enforced). */
  vertices?: Vertex[] | null
}

export interface PlanZoneSpan {
  x: number
  y: number
  w: number
  h: number
}

export interface ArchetypeReason {
  zone_id: string
  archetype: string
  reason: string
  room_ids: string[]
  spans: PlanZoneSpan[]
}

export interface Wall {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  thickness: number
  floor?: number
  kind?: 'wall' | 'open'
  /** The two room ids an interior wall separates; absent on the boundary. */
  rooms?: string[]
}
export interface Door {
  id: string
  wall_ref: string
  offset: number
  width: number
  floor?: number
}

export interface LayoutPlan {
  plot: PlanPlot
  rooms: PlanRoom[]
  walls: Wall[]
  doors: Door[]
  archetype_reasons?: ArchetypeReason[]
  connections?: Connection[]
  /** The building's outline on the plot; absent when it fills the plot. */
  footprint?: PlanZoneSpan
}

export type ConnectionKind = 'wall' | 'door' | 'open'

/** A user's choice for how two adjacent rooms meet (overrides the engine). */
export interface Connection {
  room_a: string
  room_b: string
  kind: ConnectionKind
  /** Door centre as a 0..1 fraction along the shared edge; null = centred. */
  at?: number | null
}

/** How two adjacent rooms currently meet, as last derived by the server. */
export interface RoomEdge {
  rooms: [string, string]
  kind: ConnectionKind
}

export interface Violation { code: string; room_ids: string[]; message: string }
export interface QualityWarning {
  code: string
  message: string
  severity: 'info' | 'warn'
  rule: string
}
export interface QualityReport {
  score: number
  hard_violations: Violation[]
  warnings: QualityWarning[]
}

export type ClarificationRoute = 'vague' | 'generate' | 'conflict'

export interface ExtractResponse {
  requirements: RequirementsSpec
  route: ClarificationRoute
  questions: string[]
  optional_missing: string[]
  understood_summary: string[]
}

export interface HardQualitySnapshot {
  valid: boolean
  hard_violations: Violation[]
}

/** Full Phase 6 report. `valid` preserves the Phase 4 reject-tier flag. */
export interface MvpQualitySnapshot extends QualityReport {
  valid: boolean
}

export interface MvpValidationSyncResponse {
  layout: LayoutPlan
  quality: MvpQualitySnapshot
}

export interface GenerateMvpResponse {
  requirements: RequirementsSpec
  layout: LayoutPlan
  quality: MvpQualitySnapshot
  defaults_applied: string[]
  designId: string | null
  designVersionId: string | null
  /** Canvas-shaped, geometrically distinct best-of-64 runners-up (each with a
   * `score`). Structurally LayoutOption[] from design.service — cast at the
   * consumption boundary. Empty for polygon/multi-floor programmes. */
  alternatives?: unknown[]
}

export interface MvpVersionResponse {
  id: string
  designId: string
  projectId: string
  versionNumber: number
  prompt: string | null
  requirements: RequirementsSpec
  layout: LayoutPlan
  /** Older saved versions may still carry the Phase 4 hard-only snapshot. */
  quality: MvpQualitySnapshot | HardQualitySnapshot
  createdAt: string
}

/** Editor-side clamp minima - subset of backend ROOM_SIZING (keep in sync). */
export const ROOM_MIN_SIZE: Record<RoomType, { minW: number; minD: number }> = {
  bedroom: { minW: 3.0, minD: 3.0 },
  master_bedroom: { minW: 3.3, minD: 3.3 },
  bathroom: { minW: 1.5, minD: 2.1 },
  kitchen: { minW: 2.4, minD: 3.0 },
  living_room: { minW: 3.3, minD: 3.6 },
  dining: { minW: 2.7, minD: 3.0 },
  balcony: { minW: 1.2, minD: 2.4 },
  entry: { minW: 1.2, minD: 1.5 },
  pooja_room: { minW: 1.2, minD: 1.5 },
  study: { minW: 2.4, minD: 2.7 },
  utility: { minW: 1.5, minD: 1.8 },
  parking: { minW: 2.7, minD: 5.0 },
}
