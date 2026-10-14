/**
 * Design options (Arcol-style): alternative massing schemes for one site,
 * compared side by side. Each option holds its own masses and housing; the
 * site, its rules and the plan are shared. Stored in
 * `layoutMetadata.massingOptions`; the ACTIVE option's live data stays in
 * `layoutMetadata.masses` / `.housing`, so everything else keeps working
 * unchanged, and its entry in the list is refreshed when switching away.
 */
import type { MassHousing } from './housingTypes'
import { parseHousing } from './housing'
import { massGfa, siteMetrics } from './massing'
import { floorUse, parseMasses, parseSite, type FloorUse, type Mass } from './siteTypes'

export interface MassingOption {
  id: string
  name: string
  masses: Mass[]
  housing: Record<string, MassHousing>
}

export interface MassingOptions {
  activeId: string
  list: MassingOption[]
}

type Meta = Record<string, unknown>

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const newOptionId = () => `opt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** The stored options, or one implicit "Option A" holding the current scheme. */
export function parseOptions(meta: Meta): MassingOptions {
  const raw = meta.massingOptions as Partial<MassingOptions> | undefined
  const list = Array.isArray(raw?.list)
    ? raw!.list.flatMap((o) =>
        o && typeof o.id === 'string'
          ? [{ id: o.id, name: typeof o.name === 'string' && o.name ? o.name : 'Option', masses: parseMasses(o.masses), housing: parseHousing(o.housing) }]
          : [])
    : []
  const activeId = typeof raw?.activeId === 'string' && list.some((o) => o.id === raw.activeId) ? raw.activeId : list[0]?.id
  if (!list.length || !activeId) {
    const id = 'opt-a'
    return { activeId: id, list: [{ id, name: 'Option A', masses: parseMasses(meta.masses), housing: parseHousing(meta.housing) }] }
  }
  return { activeId, list }
}

/** Options with the active one's entry refreshed from the live masses/housing. */
export function withLiveActive(meta: Meta): MassingOptions {
  const options = parseOptions(meta)
  return {
    ...options,
    list: options.list.map((o) => (o.id === options.activeId ? { ...o, masses: parseMasses(meta.masses), housing: parseHousing(meta.housing) } : o)),
  }
}

const store = (meta: Meta, options: MassingOptions, active: MassingOption): Meta => {
  const next: Meta = { ...meta, massingOptions: options, masses: active.masses }
  if (Object.keys(active.housing).length) next.housing = active.housing
  else delete next.housing
  return next
}

/** Metadata with option `id` made active (its masses/housing become the live ones). */
export function switchOption(meta: Meta, id: string): Meta {
  const options = withLiveActive(meta)
  const target = options.list.find((o) => o.id === id)
  if (!target || id === options.activeId) return meta
  return store(meta, { ...options, activeId: id }, target)
}

const nextName = (list: MassingOption[]) => {
  const used = new Set(list.map((o) => o.name))
  for (const letter of LETTERS) if (!used.has(`Option ${letter}`)) return `Option ${letter}`
  return `Option ${list.length + 1}`
}

/** A copy of the active option, made active. */
export function duplicateOption(meta: Meta, id = newOptionId()): Meta {
  const options = withLiveActive(meta)
  const active = options.list.find((o) => o.id === options.activeId)!
  const copy: MassingOption = { id, name: nextName(options.list), masses: active.masses, housing: active.housing }
  return store(meta, { activeId: id, list: [...options.list, copy] }, copy)
}

export function renameOption(meta: Meta, id: string, name: string): Meta {
  const clean = name.trim().slice(0, 40)
  if (!clean) return meta
  const options = withLiveActive(meta)
  return { ...meta, massingOptions: { ...options, list: options.list.map((o) => (o.id === id ? { ...o, name: clean } : o)) } }
}

/** Remove option `id` (never the last one); the active one moves to a neighbour. */
export function deleteOption(meta: Meta, id: string): Meta {
  const options = withLiveActive(meta)
  if (options.list.length < 2) return meta
  const index = options.list.findIndex((o) => o.id === id)
  if (index < 0) return meta
  const list = options.list.filter((o) => o.id !== id)
  if (id !== options.activeId) return { ...meta, massingOptions: { ...options, list } }
  const next = list[Math.max(0, index - 1)]
  return store(meta, { activeId: next.id, list }, next)
}

// -------------------------------------------------------------- comparing

export interface OptionMetrics {
  id: string
  name: string
  active: boolean
  gfa: number
  far: number | null
  maxHeightM: number
  coverage: number | null
  /** Homes on residential floors from the housing fill (null: not filled yet). */
  homes: number | null
  gfaByUse: Partial<Record<FloorUse, number>>
}

export function homesOf(masses: Mass[], housing: Record<string, MassHousing>): number | null {
  let filled = false
  let homes = 0
  for (const mass of masses) {
    const fill = housing[mass.id]
    if (!fill) continue
    filled = true
    homes += fill.result.units.filter((u) => floorUse(mass, u.floor) === 'residential').length
  }
  return filled ? homes : null
}

export function gfaByUse(masses: Mass[]): Partial<Record<FloorUse, number>> {
  const out: Partial<Record<FloorUse, number>> = {}
  for (const mass of masses) {
    const plate = massGfa(mass) / mass.floors
    for (let i = 0; i < mass.floors; i++) {
      const use = floorUse(mass, i)
      out[use] = (out[use] ?? 0) + plate
    }
  }
  return out
}

/** Every option's headline numbers against the shared site. */
export function compareOptions(meta: Meta): OptionMetrics[] {
  const site = parseSite(meta.site)
  const options = withLiveActive(meta)
  return options.list.map((o) => {
    const m = siteMetrics(site, o.masses)
    return {
      id: o.id,
      name: o.name,
      active: o.id === options.activeId,
      gfa: m.gfa,
      far: m.far,
      maxHeightM: m.maxHeightM,
      coverage: m.coverage,
      homes: homesOf(o.masses, o.housing),
      gfaByUse: gfaByUse(o.masses),
    }
  })
}
