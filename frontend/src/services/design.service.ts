import api from './api'
import type { CanvasFloor, CanvasLayout, GenerationInsights, Room } from '../store/canvasStore'

export interface GenerateMetadata {
  [key: string]: unknown
  prompt: string
  building_type: string
  buildingType?: string
  style?: string
  room_count: number
  totalFloors?: number
  totalRooms?: number
  totalAreaSqm?: number
}

export interface LayoutOption {
  version: string
  metadata: GenerateMetadata
  building?: {
    floorHeight?: number
  }
  floors?: CanvasFloor[]
  rooms: Room[]
  insights?: GenerationInsights
  /** Top-level score carried by MVP best-of-64 alternatives. */
  score?: number
}

export interface GenerateResponse {
  version: string
  designId?: string
  designVersionId?: string
  /** The design's revision when this was read; sent back as `baseRevision` on save. */
  revision?: number
  metadata: GenerateMetadata
  building?: {
    floorHeight?: number
  }
  floors?: CanvasFloor[]
  rooms: Room[]
  insights?: GenerationInsights
  alternatives?: LayoutOption[]
}

export interface DesignDraftResponse extends Omit<GenerateResponse, 'metadata'> {
  id: string
  designId: string
  designVersionId?: string
  projectId: string
  versionNumber: number
  versionType: string
  changeSummary?: string | null
  createdAt: string
  updatedAt?: string | null
  metadata: Record<string, unknown>
}

export async function getLatestProjectDesign(projectId: string): Promise<GenerateResponse> {
  const { data } = await api.get<GenerateResponse>(`/api/design/project/${projectId}/latest`)
  return data
}

/** Saved on top of this revision of the design; refused with 409 if it is no longer current. */
export interface RevisionOptions {
  baseRevision?: number | null
}

/** A save refused because the design changed since this editor loaded it (HTTP 409). */
export interface RevisionConflict {
  currentRevision: number
  message: string
}

export function revisionConflictOf(error: unknown): RevisionConflict | null {
  const response = (error as { response?: { status?: number; data?: { code?: string; error?: string; currentRevision?: number } } })?.response
  if (response?.status !== 409 || response.data?.code !== 'REVISION_CONFLICT') return null
  return {
    currentRevision: Number(response.data.currentRevision ?? 0),
    message: response.data.error ?? 'This design was changed somewhere else since you opened it.',
  }
}

export async function saveDesignLayout(
  designId: string,
  layout: CanvasLayout,
  options?: {
    versionName?: string
    changeSummary?: string
    thumbnailUrl?: string | null
  } & RevisionOptions
): Promise<GenerateResponse> {
  const { data } = await api.put<GenerateResponse>(`/api/design/${designId}`, {
    layout,
    versionName: options?.versionName,
    changeSummary: options?.changeSummary,
    thumbnailUrl: options?.thumbnailUrl,
    baseRevision: options?.baseRevision ?? undefined,
  })
  return data
}

export async function saveDesignDraft(
  designId: string,
  layout: CanvasLayout,
  options?: RevisionOptions,
): Promise<DesignDraftResponse> {
  const { data } = await api.put<DesignDraftResponse>(`/api/design/${designId}/draft`, {
    layout,
    baseRevision: options?.baseRevision ?? undefined,
  })
  return data
}

export async function fetchDesignDraft(
  designId: string,
): Promise<DesignDraftResponse | null> {
  try {
    const { data } = await api.get<DesignDraftResponse>(`/api/design/${designId}/draft`)
    return data
  } catch (error) {
    if (isNotFoundResponse(error)) return null
    throw error
  }
}

export async function fetchVersion(versionId: string): Promise<GenerateResponse> {
  const { data } = await api.get<GenerateResponse>(`/api/design/version/${versionId}`)
  return data
}

function isNotFoundResponse(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  )
}
