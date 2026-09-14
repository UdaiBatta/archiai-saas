export const CANVAS_OBJECT_TYPES = [
  'room',
  'wall',
  'door',
  'window',
  'stair',
  'floor',
  'open_space',
  'corridor',
  'lift',
  'shaft',
  'furniture',
  'column',
  'generic',
] as const

export type CanvasObjectType = (typeof CANVAS_OBJECT_TYPES)[number]

export type ComponentCategory =
  | 'space'
  | 'structure'
  | 'opening'
  | 'vertical'
  | 'furniture'
  | 'legacy'
  | 'generic'

export interface ComponentSize {
  w: number
  h: number
  d: number
}

export interface ComponentInspectorPolicy {
  label: boolean
  type: boolean
  floor: boolean
  position: boolean
  size: boolean
  rotation: boolean
}

export interface ComponentDefinition {
  type: CanvasObjectType
  label: string
  category: ComponentCategory
  defaultSize: ComponentSize
  defaultColor: string
  canCreate: boolean
  canSelect: boolean
  canMove: boolean
  canResize: boolean
  canRotate: boolean
  minSize: ComponentSize
  beginnerTool: boolean
  professionalTool: boolean
  inspector: ComponentInspectorPolicy
  renderingTreatment: 'solid' | 'thin' | 'slab' | 'marker'
  aliases?: string[]
  legacy?: boolean
}

const EDITABLE_INSPECTOR: ComponentInspectorPolicy = {
  label: true,
  type: true,
  floor: true,
  position: true,
  size: true,
  rotation: true,
}

export const COMPONENT_REGISTRY: Record<CanvasObjectType, ComponentDefinition> = {
  room: {
    type: 'room',
    label: 'Room',
    category: 'space',
    defaultSize: { w: 4, h: 3, d: 4 },
    defaultColor: '#5F6E88',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 1, h: 2.1, d: 1 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
  },
  wall: {
    type: 'wall',
    label: 'Wall',
    category: 'structure',
    defaultSize: { w: 6, h: 2.8, d: 0.25 },
    defaultColor: '#BDBDC0',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.4, h: 0.4, d: 0.05 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'thin',
  },
  door: {
    type: 'door',
    label: 'Door',
    category: 'opening',
    defaultSize: { w: 1, h: 2.2, d: 0.2 },
    defaultColor: '#9C8468',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.6, h: 1.8, d: 0.05 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'thin',
  },
  window: {
    type: 'window',
    label: 'Window',
    category: 'opening',
    defaultSize: { w: 1.4, h: 1.2, d: 0.18 },
    defaultColor: '#7C93A6',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.4, h: 0.4, d: 0.05 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'thin',
  },
  stair: {
    type: 'stair',
    label: 'Stair',
    category: 'vertical',
    defaultSize: { w: 2.5, h: 1, d: 4 },
    defaultColor: '#8A7D64',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 1, h: 0.2, d: 1 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
    aliases: ['stairs', 'staircase'],
  },
  floor: {
    type: 'floor',
    label: 'Floor Object',
    category: 'legacy',
    defaultSize: { w: 8, h: 0.15, d: 8 },
    defaultColor: '#373738',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 1, h: 0.05, d: 1 },
    beginnerTool: false,
    professionalTool: true,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'slab',
    legacy: true,
  },
  open_space: {
    type: 'open_space',
    label: 'Open Space',
    category: 'space',
    defaultSize: { w: 5, h: 0.1, d: 5 },
    defaultColor: '#5C6B57',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 1, h: 0.05, d: 1 },
    beginnerTool: false,
    professionalTool: true,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'slab',
    aliases: ['open space', 'open-space'],
  },
  corridor: {
    type: 'corridor',
    label: 'Corridor',
    category: 'space',
    defaultSize: { w: 6, h: 3, d: 1.5 },
    defaultColor: '#3A3E45',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 1, h: 2.1, d: 0.8 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
    aliases: ['hallway', 'hall', 'passage'],
  },
  lift: {
    type: 'lift',
    label: 'Lift',
    category: 'vertical',
    defaultSize: { w: 2, h: 3.2, d: 2 },
    defaultColor: '#5A5A5E',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 1.2, h: 2, d: 1.2 },
    beginnerTool: false,
    professionalTool: true,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
    aliases: ['elevator'],
  },
  shaft: {
    type: 'shaft',
    label: 'Shaft',
    category: 'vertical',
    defaultSize: { w: 1.5, h: 3.2, d: 1.5 },
    defaultColor: '#48484A',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.5, h: 1, d: 0.5 },
    beginnerTool: false,
    professionalTool: true,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
  },
  furniture: {
    type: 'furniture',
    label: 'Furniture',
    category: 'furniture',
    defaultSize: { w: 1.4, h: 0.8, d: 0.8 },
    defaultColor: '#6E6659',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.2, h: 0.1, d: 0.2 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
  },
  column: {
    type: 'column',
    label: 'Column',
    category: 'structure',
    defaultSize: { w: 0.35, h: 3, d: 0.35 },
    defaultColor: '#909094',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.1, h: 0.5, d: 0.1 },
    beginnerTool: true,
    professionalTool: false,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'thin',
  },
  generic: {
    type: 'generic',
    label: 'Generic Object',
    category: 'generic',
    defaultSize: { w: 2, h: 2, d: 2 },
    defaultColor: '#4A4E56',
    canCreate: true,
    canSelect: true,
    canMove: true,
    canResize: true,
    canRotate: true,
    minSize: { w: 0.1, h: 0.1, d: 0.1 },
    beginnerTool: false,
    professionalTool: true,
    inspector: EDITABLE_INSPECTOR,
    renderingTreatment: 'solid',
  },
}

export const COMPONENT_DEFINITIONS = CANVAS_OBJECT_TYPES.map(
  (type) => COMPONENT_REGISTRY[type],
)

export const BEGINNER_COMPONENTS = COMPONENT_DEFINITIONS.filter(
  (definition) => definition.canCreate && definition.beginnerTool,
)

export const PROFESSIONAL_COMPONENTS = COMPONENT_DEFINITIONS.filter(
  (definition) => definition.canCreate && definition.professionalTool,
)

export function isCanvasObjectType(value: unknown): value is CanvasObjectType {
  return (
    typeof value === 'string' &&
    (CANVAS_OBJECT_TYPES as readonly string[]).includes(value)
  )
}

export function normalizeCanvasObjectType(value: unknown): CanvasObjectType | null {
  if (isCanvasObjectType(value)) return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (isCanvasObjectType(normalized)) return normalized

  const match = COMPONENT_DEFINITIONS.find((definition) =>
    definition.aliases?.some(
      (alias) => alias.trim().toLowerCase().replace(/[\s-]+/g, '_') === normalized,
    ),
  )
  return match?.type ?? null
}

export function componentTypeToRoomType(type: CanvasObjectType) {
  return type === 'stair' ? 'stairs' : type
}

export function getComponentDefinition(type: CanvasObjectType) {
  return COMPONENT_REGISTRY[type]
}

export function clampComponentSize(
  type: CanvasObjectType,
  size: ComponentSize,
  fallback: ComponentSize = COMPONENT_REGISTRY[type].defaultSize,
): ComponentSize {
  const baseMin = COMPONENT_REGISTRY[type].minSize
  // Generated walls/openings can encode their long axis as depth instead of
  // width. Keep their thin axis thin when loading or editing those records.
  const vertical = ['wall', 'door', 'window'].includes(type) && size.w > 0 && size.d > size.w
  const min = vertical ? { w: baseMin.d, h: baseMin.h, d: baseMin.w } : baseMin
  const finite = (value: number, fallbackValue: number, minValue: number) => {
    if (!Number.isFinite(value)) return Math.max(minValue, fallbackValue)
    return Math.max(minValue, value)
  }

  return {
    w: finite(size.w, fallback.w, min.w),
    h: finite(size.h, fallback.h, min.h),
    d: finite(size.d, fallback.d, min.d),
  }
}
