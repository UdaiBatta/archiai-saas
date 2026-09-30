import api from './api'
import type {
  ExtractResponse,
  GenerateMvpResponse,
  HardQualitySnapshot,
  LayoutPlan,
  MvpQualitySnapshot,
  MvpValidationSyncResponse,
  MvpVersionResponse,
  RequirementsSpec,
} from '../types/contracts'

export async function extractBrief(
  prompt: string,
  signal?: AbortSignal,
): Promise<ExtractResponse> {
  const { data } = await api.post<ExtractResponse>('/api/extract', { prompt }, { signal })
  return data
}

export interface GenerateMvpOptions {
  requirements: RequirementsSpec
  useDefaults?: boolean
  projectId?: string
  prompt?: string
}

export async function generateMvpLayout(
  options: GenerateMvpOptions,
  signal?: AbortSignal,
): Promise<GenerateMvpResponse> {
  const { data } = await api.post<GenerateMvpResponse>(
    '/api/generate',
    {
      requirements: options.requirements,
      useDefaults: options.useDefaults ?? false,
      projectId: options.projectId,
      prompt: options.prompt,
    },
    { signal },
  )
  return data
}

export interface FullQualityOptions {
  requirements: RequirementsSpec
  includeVastu?: boolean
}

export function validateMvpLayout(layout: LayoutPlan): Promise<HardQualitySnapshot>
export function validateMvpLayout(
  layout: LayoutPlan,
  options: FullQualityOptions,
): Promise<MvpQualitySnapshot>
export async function validateMvpLayout(
  layout: LayoutPlan,
  options?: FullQualityOptions,
): Promise<HardQualitySnapshot | MvpQualitySnapshot> {
  if (options) {
    const query = options.includeVastu ? '?full=true&vastu=true' : '?full=true'
    const { data } = await api.post<MvpQualitySnapshot>(`/api/validate${query}`, {
      layout,
      requirements: options.requirements,
    })
    return data
  }

  const { data } = await api.post<HardQualitySnapshot>('/api/validate', { layout })
  return data
}

export async function validateAndSyncMvpLayout(
  layout: LayoutPlan,
  options: FullQualityOptions,
): Promise<MvpValidationSyncResponse> {
  const query = options.includeVastu
    ? '?full=true&includeLayout=true&vastu=true'
    : '?full=true&includeLayout=true'
  const { data } = await api.post<MvpValidationSyncResponse>(
    `/api/validate${query}`,
    {
      layout,
      requirements: options.requirements,
    },
  )
  return data
}

export async function saveMvpVersion(
  projectId: string,
  payload: {
    prompt?: string
    requirements: RequirementsSpec
    layout: LayoutPlan
    quality?: MvpQualitySnapshot | HardQualitySnapshot
  },
): Promise<MvpVersionResponse> {
  const { data } = await api.post<MvpVersionResponse>(
    `/api/projects/${projectId}/versions`,
    payload,
  )
  return data
}

export async function fetchMvpVersion(versionId: string): Promise<MvpVersionResponse> {
  const { data } = await api.get<MvpVersionResponse>(`/api/versions/${versionId}`)
  return data
}

/** One validated assistant command; `description` is its plain-words line. */
export interface AssistantCommand {
  op: 'resize_room' | 'move_room' | 'swap_rooms' | 'rename_room' | 'set_connection' | 'change_program' | 'explain'
  description: string
  text?: string
  [key: string]: unknown
}

/** A PROPOSED edit: nothing changes until the user applies `layout_after`. */
export interface AssistantResponse {
  summary: string
  commands: AssistantCommand[]
  layout_after: LayoutPlan
  requirements_after: RequirementsSpec
  quality_before: MvpQualitySnapshot
  quality_after: MvpQualitySnapshot
  introduces_hard_violations: boolean
  changed: boolean
  warnings: string[]
}

export async function planAssistantEdits(
  payload: {
    instruction: string
    layout: LayoutPlan
    requirements: RequirementsSpec
    selected_room_id?: string
  },
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  const { data } = await api.post<AssistantResponse>('/api/assistant/plan-edits', payload, { signal })
  return data
}
