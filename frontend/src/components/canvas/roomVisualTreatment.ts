import type {
  CanvasObjectType,
  ComponentDefinition,
} from '../../store/componentRegistry'
import { EDITOR_PALETTE } from './editorPalette'

export interface RoomVisualTreatment {
  opacity: number
  depthWrite: boolean
  roughness: number
  metalness: number
  emissive: string
  emissiveIntensity: number
  edgeColor: string
}

export function roomVisualTreatment(
  definition: ComponentDefinition,
  objectType: CanvasObjectType,
  selected: boolean,
  planView: boolean,
  invalid = false,
): RoomVisualTreatment {
  const baseOpacity =
    objectType === 'window'
      ? 0.48
      : objectType === 'door'
        ? 0.74
        : definition.renderingTreatment === 'thin'
          ? 0.7
          : definition.renderingTreatment === 'slab'
            ? 0.58
            : selected
              ? 0.55
              : planView && definition.category === 'space'
                ? 0.68
                : definition.category === 'space'
                  ? 0.3
                  : 0.78
  const opacity = invalid ? Math.max(baseOpacity, 0.9) : baseOpacity

  return {
    opacity,
    depthWrite: opacity > 0.75,
    roughness: definition.category === 'opening' ? 0.48 : 0.72,
    metalness: definition.category === 'structure' ? 0.07 : 0.02,
    emissive: invalid ? EDITOR_PALETTE.invalid : selected ? '#ffffff' : '#000000',
    emissiveIntensity: invalid ? 0.28 : selected ? 0.12 : 0,
    edgeColor: invalid ? EDITOR_PALETTE.invalid : selected ? '#ffffff' : '#1E1E1F',
  }
}
