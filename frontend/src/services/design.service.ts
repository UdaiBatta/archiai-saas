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

export interface DesignParams {
  plotWidthM?: number
  floors?: number
  orientation?: 'N' | 'S' | 'E' | 'W'
}

export async function generateLayout(
  prompt: string,
  projectId?: string,
  designParams?: DesignParams,
): Promise<GenerateResponse> {
  const { data } = await api.post<GenerateResponse>('/api/design/generate', {
    prompt,
    projectId,
    designParams,
  })
  return data
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

export interface RefineResponse extends GenerateResponse {
  refinementSummary: string
  refinementChanges?: RefinementChange[]
}

export interface RefinementChange {
  action: 'resize' | 'remove' | 'add'
  objectId: string
  roomType: string
  label: string
  floorLevel: number
  description: string
}

export async function refineLayout(
  designId: string,
  prompt: string,
): Promise<RefineResponse> {
  const { data } = await api.post<RefineResponse>('/api/design/refine', {
    designId,
    prompt,
  })
  return data
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
