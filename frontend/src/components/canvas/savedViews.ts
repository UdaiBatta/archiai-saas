/**
 * Named camera views saved with the project (in `layoutMetadata.savedViews`).
 * Pure helpers: the JSON comes back from the server, so parsing is defensive.
 */
import { CAMERA_PRESETS, type CameraPreset } from './modelView'
import { SUNRISE, SUNSET } from './sunModel'

type Vec3 = [number, number, number]

export interface SavedView {
  id: string
  name: string
  position: Vec3
  target: Vec3
  /** Orthographic zoom; 1 for the perspective camera. */
  zoom: number
  preset: CameraPreset
  sunHour: number
  selectedFloor: number | 'all'
  ghostFloors: boolean
}

export type ViewState = Omit<SavedView, 'id' | 'name'>

export const MAX_VIEW_NAME = 40

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum)
const round = (v: number) => Math.round(v * 1000) / 1000

function parseView(raw: unknown): SavedView | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (typeof v.id !== 'string' || typeof v.name !== 'string' || !v.name.trim()) return null
  if (!isVec3(v.position) || !isVec3(v.target) || !isNum(v.zoom) || v.zoom <= 0) return null
  if (!CAMERA_PRESETS.some((p) => p.value === v.preset)) return null
  const floor = v.selectedFloor === 'all' || isNum(v.selectedFloor) ? v.selectedFloor : 'all'
  return {
    id: v.id,
    name: v.name.slice(0, MAX_VIEW_NAME),
    position: v.position,
    target: v.target,
    zoom: v.zoom,
    preset: v.preset as CameraPreset,
    sunHour: isNum(v.sunHour) ? Math.min(SUNSET, Math.max(SUNRISE, v.sunHour)) : 10,
    selectedFloor: floor as number | 'all',
    ghostFloors: v.ghostFloors === true,
  }
}

/** Saved views from layout metadata; malformed entries are dropped. */
export function parseSavedViews(metadata: Record<string, unknown>): SavedView[] {
  const raw = metadata.savedViews
  if (!Array.isArray(raw)) return []
  return raw.map(parseView).filter((view): view is SavedView => view !== null)
}

/** `name`, or `name 2`, `name 3`... so no two views share a name (case-insensitive). */
export function uniqueViewName(name: string, taken: string[]): string {
  const base = name.trim().slice(0, MAX_VIEW_NAME) || 'View'
  const used = new Set(taken.map((n) => n.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

export function addView(views: SavedView[], state: ViewState, id: string, name = `View ${views.length + 1}`): SavedView[] {
  const view: SavedView = {
    ...state,
    id,
    name: uniqueViewName(name, views.map((v) => v.name)),
    position: state.position.map(round) as Vec3,
    target: state.target.map(round) as Vec3,
    zoom: round(state.zoom),
  }
  return [...views, view]
}

/** Rename; a blank name keeps the old one. */
export function renameView(views: SavedView[], id: string, name: string): SavedView[] {
  if (!name.trim()) return views
  const others = views.filter((v) => v.id !== id).map((v) => v.name)
  return views.map((v) => (v.id === id ? { ...v, name: uniqueViewName(name, others) } : v))
}

export const deleteView = (views: SavedView[], id: string) => views.filter((v) => v.id !== id)

/** The floor to show when restoring: fall back to 'all' if that level is gone. */
export function restorableFloor(view: SavedView, levels: number[]): number | 'all' {
  return view.selectedFloor === 'all' || levels.includes(view.selectedFloor) ? view.selectedFloor : 'all'
}
