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

export async function saveDesignLayout(
  designId: string,
  layout: CanvasLayout,
  options?: {
    versionName?: string
    changeSummary?: string
    thumbnailUrl?: string | null
  }
): Promise<GenerateResponse> {
  const { data } = await api.put<GenerateResponse>(`/api/design/${designId}`, {
    layout,
    versionName: options?.versionName,
    changeSummary: options?.changeSummary,
    thumbnailUrl: options?.thumbnailUrl,
  })
  return data
}

export async function saveDesignDraft(
  designId: string,
  layout: CanvasLayout,
): Promise<DesignDraftResponse> {
  const { data } = await api.put<DesignDraftResponse>(`/api/design/${designId}/draft`, {
    layout,
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
