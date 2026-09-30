import { useMemo } from 'react'
import { create } from 'zustand'
import { useCanvasStore } from '../store/canvasStore'
import { parseMasses, parseSite, type Mass } from './siteTypes'
import { parseHousing } from './housing'

export type DrawMode = 'rect' | 'poly' | null

/** Massing UI state (not saved, not undoable): selection and the Top view draw tool. */
export const useMassUi = create<{
  selectedMassId: string | null
  drawMode: DrawMode
  select: (id: string | null) => void
  setDrawMode: (mode: DrawMode) => void
}>((set) => ({
  selectedMassId: null,
  drawMode: null,
  select: (selectedMassId) => set({ selectedMassId }),
  setDrawMode: (drawMode) => set({ drawMode }),
}))

/** Site and masses from the layout, re-parsed only when they change. */
export function useSiteAndMasses() {
  const rawSite = useCanvasStore((s) => s.layoutMetadata.site)
  const rawMasses = useCanvasStore((s) => s.layoutMetadata.masses)
  const site = useMemo(() => parseSite(rawSite), [rawSite])
  const masses = useMemo(() => parseMasses(rawMasses), [rawMasses])
  return { site, masses }
}

export const currentMasses = () => parseMasses(useCanvasStore.getState().layoutMetadata.masses)

/** Live drag preview: writes masses without an undo step or autosave. */
export function previewMasses(masses: Mass[]) {
  useCanvasStore.setState((s) => ({ layoutMetadata: { ...s.layoutMetadata, masses } }))
}

/** End of a drag: one undo step from `start` to `final` (nothing if unchanged). */
export function commitMasses(start: Mass[], final: Mass[]) {
  previewMasses(start)
  if (JSON.stringify(start) !== JSON.stringify(final)) useCanvasStore.getState().setMasses(final)
}

/** Housing UI state (not saved): the floor being looked at, the picked unit, auto re-solve. */
export const useHousingUi = create<{
  floor: number | 'all'
  unitId: string | null
  autoResolve: boolean
  setFloor: (floor: number | 'all') => void
  pickUnit: (unitId: string | null) => void
  setAutoResolve: (on: boolean) => void
}>((set) => ({
  floor: 'all',
  unitId: null,
  autoResolve: false,
  setFloor: (floor) => set({ floor }),
  pickUnit: (unitId) => set({ unitId }),
  setAutoResolve: (autoResolve) => set({ autoResolve }),
}))

/** Every mass's stored housing fill, re-parsed only when it changes. */
export function useHousing() {
  const raw = useCanvasStore((s) => s.layoutMetadata.housing)
  return useMemo(() => parseHousing(raw), [raw])
}
