import { create } from 'zustand'

/** Transient site-tool UI state (not saved, not undoable). */
interface SiteUiState {
  /** Edge highlighted in 3D while its setback field is hovered or focused. */
  hoveredEdge: number | null
  /** "Draw site" active (Top view only). */
  drawing: boolean
  showHeightCap: boolean
  setHoveredEdge: (edge: number | null) => void
  setDrawing: (drawing: boolean) => void
  setShowHeightCap: (show: boolean) => void
}

export const useSiteUi = create<SiteUiState>((set) => ({
  hoveredEdge: null,
  drawing: false,
  showHeightCap: true,
  setHoveredEdge: (hoveredEdge) => set({ hoveredEdge }),
  setDrawing: (drawing) => set({ drawing }),
  setShowHeightCap: (showHeightCap) => set({ showHeightCap }),
}))
