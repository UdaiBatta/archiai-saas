import type {
  ExtractResponse,
  Facing,
  RequirementsSpec,
} from '../types/contracts'

export interface GenerationOverrides {
  plotWidthM?: string
  floors?: string
  orientation?: '' | 'N' | 'S' | 'E' | 'W'
}

const FACING_BY_ORIENTATION: Record<'N' | 'S' | 'E' | 'W', Facing> = {
  N: 'north',
  S: 'south',
  E: 'east',
  W: 'west',
}

function optionalNumber(value: string | undefined) {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function applyGenerationOverrides(
  requirements: RequirementsSpec,
  overrides: GenerationOverrides,
): RequirementsSpec {
  const width = optionalNumber(overrides.plotWidthM)
  const floors = optionalNumber(overrides.floors)
  const orientation = overrides.orientation || undefined

  return {
    ...requirements,
    floors:
      floors !== undefined && Number.isInteger(floors) && floors >= 1 && floors <= 5
        ? floors
        : requirements.floors,
    facing: orientation
      ? FACING_BY_ORIENTATION[orientation]
      : requirements.facing,
    plot: {
      ...requirements.plot,
      width_m:
        width !== undefined && width > 0 && width < 100
          ? width
          : requirements.plot.width_m,
    },
    rooms: requirements.rooms.map((room) => ({ ...room })),
    spaces: requirements.spaces?.map((space) => ({ ...space })),
    adjacency: requirements.adjacency.map((edge) => ({ ...edge })),
    avoid_adjacency: requirements.avoid_adjacency.map((edge) => ({ ...edge })),
    missing_info: [...requirements.missing_info],
  }
}

export function reviewWithOverrides(
  review: ExtractResponse,
  overrides: GenerationOverrides,
): ExtractResponse {
  const requirements = applyGenerationOverrides(review.requirements, overrides)
  const floorOverride = optionalNumber(overrides.floors)
  const widthOverride = optionalNumber(overrides.plotWidthM)
  const orientation = overrides.orientation || undefined
  const understood = review.understood_summary.filter((item) => {
    if (floorOverride !== undefined && /^\d+ floors?$/.test(item)) return false
    if (widthOverride !== undefined && item.startsWith('Plot:')) return false
    if (orientation && item.startsWith('Entry faces ')) return false
    return true
  })

  if (
    floorOverride !== undefined &&
    Number.isInteger(floorOverride) &&
    floorOverride >= 1 &&
    floorOverride <= 5
  ) {
    understood.push(`${floorOverride} ${floorOverride === 1 ? 'floor' : 'floors'}`)
  }
  if (widthOverride !== undefined && widthOverride > 0 && widthOverride < 100) {
    understood.push(`Plot width: ${widthOverride} m`)
  }
  if (orientation) {
    understood.push(`Entry faces ${FACING_BY_ORIENTATION[orientation]}`)
  }

  const optionalMissing = review.optional_missing.filter((question) => {
    const normalized = question.toLowerCase()
    if (
      normalized.includes('plot size') &&
      requirements.plot.width_m !== null &&
      requirements.plot.depth_m !== null
    ) {
      return false
    }
    if (normalized.includes('direction') && requirements.facing !== null) {
      return false
    }
    if (
      normalized.includes('bathroom') &&
      (requirements.spaces?.some(
        (space) =>
          (space.space_type === 'bathroom' || space.space_type === 'ensuite') &&
          space.count > 0,
      ) ||
        requirements.rooms.some(
          (room) => room.type === 'bathroom' && room.count > 0,
        ))
    ) {
      return false
    }
    return true
  })

  return {
    ...review,
    requirements,
    optional_missing: optionalMissing,
    understood_summary: understood,
  }
}
