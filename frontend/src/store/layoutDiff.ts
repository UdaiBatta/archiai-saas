import type { Room } from './canvasStore'

/** How two copies of a plan differ, at the level an architect reads it: rooms and objects, not meshes. */
export interface LayoutDiff {
  /** Only in the first copy (yours), by label. */
  onlyHere: string[]
  /** Only in the second copy (the saved one), by label. */
  onlyThere: string[]
  /** In both, but different: the label and what changed. */
  changed: { label: string; what: string[] }[]
}

const MOVE_TOLERANCE_M = 0.05

/** Walls, doors and windows the engine derives from rooms carry no edits of their own. */
const isAuthored = (room: Room) => room.derived !== 'engine'

const sameSize = (a: Room, b: Room) =>
  Math.abs(a.size.w - b.size.w) <= MOVE_TOLERANCE_M &&
  Math.abs(a.size.d - b.size.d) <= MOVE_TOLERANCE_M &&
  Math.abs(a.size.h - b.size.h) <= MOVE_TOLERANCE_M

const samePlace = (a: Room, b: Room) =>
  Math.abs(a.position.x - b.position.x) <= MOVE_TOLERANCE_M && Math.abs(a.position.z - b.position.z) <= MOVE_TOLERANCE_M

/** Compare `here` (this tab) with `there` (the copy on the server), matching objects by id. */
export function diffLayouts(here: Room[], there: Room[]): LayoutDiff {
  const mine = new Map(here.filter(isAuthored).map((room) => [room.id, room]))
  const theirs = new Map(there.filter(isAuthored).map((room) => [room.id, room]))
  const changed: LayoutDiff['changed'] = []

  for (const [id, a] of mine) {
    const b = theirs.get(id)
    if (!b) continue
    const what: string[] = []
    if (a.label !== b.label) what.push(`named "${b.label}" there`)
    if (a.roomType !== b.roomType) what.push('different use')
    if (!sameSize(a, b)) what.push('resized')
    if (!samePlace(a, b)) what.push('moved')
    if (what.length > 0) changed.push({ label: a.label, what })
  }

  return {
    onlyHere: [...mine].filter(([id]) => !theirs.has(id)).map(([, room]) => room.label),
    onlyThere: [...theirs].filter(([id]) => !mine.has(id)).map(([, room]) => room.label),
    changed,
  }
}

export const isSameLayout = (diff: LayoutDiff) =>
  diff.onlyHere.length === 0 && diff.onlyThere.length === 0 && diff.changed.length === 0
