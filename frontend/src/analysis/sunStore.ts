import { create } from 'zustand'
import { useCanvasStore } from '../store/canvasStore'
import { useSiteAndMasses } from '../site/massStore'
import { DEFAULT_LOCATION, parseSite, type SiteLocation } from '../site/siteTypes'
import type { Where } from './solar'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Sun study UI state (not saved): the date, and a location for a model
 * without a site (with a site, the location is saved on it).
 */
export const useSunUi = create<{
  date: string
  looseLocation: SiteLocation | null
  setDate: (date: string) => void
  setLooseLocation: (location: SiteLocation) => void
}>((set) => ({
  date: today(),
  looseLocation: null,
  setDate: (date) => set({ date }),
  setLooseLocation: (looseLocation) => set({ looseLocation }),
}))

export interface SunContext extends Where {
  /** No location set anywhere: the Delhi default is in use. */
  isDefault: boolean
}

/** Where and when the 3D sun and the analysis are computed for. */
export function useSunContext(): SunContext {
  const { site } = useSiteAndMasses()
  const date = useSunUi((s) => s.date)
  const loose = useSunUi((s) => s.looseLocation)
  const location = site?.location ?? loose
  return { ...(location ?? DEFAULT_LOCATION), date, isDefault: !location }
}

/** Saves the location on the site (one undo step), or keeps it for this session without one. */
export function setSunLocation(location: SiteLocation) {
  const { layoutMetadata, setSite } = useCanvasStore.getState()
  const site = parseSite(layoutMetadata.site)
  if (site) setSite({ ...site, location })
  else useSunUi.getState().setLooseLocation(location)
}
