import { create } from 'zustand'
import type { ViewStyle } from './modelView'

/**
 * Which look the 3D view uses while laying out (plan 005). A view setting:
 * not saved with the plan and not in undo history.
 */
interface ViewStyleState {
  style: ViewStyle
  setStyle: (style: ViewStyle) => void
}

export const useViewStyle = create<ViewStyleState>((set) => ({
  style: 'blocks',
  setStyle: (style) => set({ style }),
}))

/**
 * Whether the 3D view draws blocks right now. Only in Persp/Axo of the layout
 * stage; the Top plan keeps its drawing look, the model stage keeps the white
 * model, and the sun studies need the real full-height building (the sun-hours
 * heatmap samples façades at full height, and the Sun tool shows real shadows).
 */
export function blocksActive(state: {
  studio: boolean
  topView: boolean
  modelStage: boolean
  style: ViewStyle
  /** The Sun or Analysis tool is open, or a sun-hours heatmap is on screen. */
  sunStudy: boolean
}): boolean {
  return state.studio && !state.topView && !state.modelStage && state.style === 'blocks' && !state.sunStudy
}
