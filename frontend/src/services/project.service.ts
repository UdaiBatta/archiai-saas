import api from './api'
import type { CanvasLayout } from '../store/canvasStore'
import type { LayoutPlan } from '../types/contracts'

export type FileExportFormat = 'dxf' | 'ifc' | 'glb' | 'obj' | 'svg'

export interface Project {
  id: string
  user_id: string
  workspace_id?: string | null
  title: string
  description: string | null
  thumbnail_url?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectVersion {
  id: string
  design_id: string
  project_id: string
  version_number: number
  version_name?: string | null
  version_type?: string | null
  change_summary?: string | null
  created_by: string
  created_at: string
}

export interface ActivityEntry {
  id: string
  action: string
  timestamp: string
}

export interface ExportRecord {
  id: string
  project_id: string
  user_id: string
  export_type: 'image' | 'pdf'
  file_url?: string | null
  created_at: string
}

export interface ProjectShare {
  id: string
  project_id: string
  token: string
  share_url: string
  access_type: 'public'
  is_active: boolean
  created_at: string
  revoked_at?: string | null
}

export interface SharedProject {
  project: Pick<Project, 'id' | 'title' | 'description'>
  layout: CanvasLayout | null
}

export interface CreateProjectData {
  title: string
  description?: string
  workspace_id?: string | null
}

export interface UpdateProjectData {
  title?: string
  description?: string
  workspace_id?: string | null
  thumbnail_url?: string
}

const projectService = {
  list: (): Promise<Project[]> =>
    api.get('/api/projects').then((r) => r.data),

  get: (id: string): Promise<Project> =>
    api.get(`/api/projects/${id}`).then((r) => r.data),

  create: (data: CreateProjectData): Promise<Project> =>
    api.post('/api/projects', data).then((r) => r.data),

  update: (id: string, data: UpdateProjectData): Promise<Project> =>
    api.put(`/api/projects/${id}`, data).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/api/projects/${id}`).then(() => undefined),

  duplicate: (id: string): Promise<Project> =>
    api.post(`/api/projects/${id}/duplicate`).then((r) => r.data),

  versions: (id: string): Promise<ProjectVersion[]> =>
    api.get(`/api/projects/${id}/versions`).then((r) => r.data),

  activity: (id: string): Promise<ActivityEntry[]> =>
    api.get(`/api/projects/${id}/activity`).then((r) => r.data),

  recordExport: (id: string, exportType: 'image' | 'pdf'): Promise<ExportRecord> =>
    api.post(`/api/projects/${id}/export/${exportType}`).then((r) => r.data),

  /** Server-built CAD/BIM/3D file for the given plan. OBJ comes back zipped. */
  exportFile: async (
    id: string,
    format: FileExportFormat,
    layout: LayoutPlan,
  ): Promise<{ blob: Blob; filename: string }> => {
    const r = await api
      .post(`/api/projects/${id}/export/${format}`, { layout }, { responseType: 'blob' })
      .catch(async (err) => {
        // Error bodies arrive as a Blob too; decode so getApiErrorMessage can read them.
        const data = err?.response?.data
        if (data instanceof Blob) err.response.data = await data.text().then(JSON.parse).catch(() => data)
        throw err
      })
    const match = /filename="?([^";]+)"?/i.exec(String(r.headers?.['content-disposition'] ?? ''))
    return { blob: r.data, filename: match?.[1] ?? `plan.${format === 'obj' ? 'zip' : format}` }
  },

  createShare: (id: string): Promise<ProjectShare> =>
    api.post(`/api/projects/${id}/share`).then((r) => r.data),

  revokeShare: (projectId: string, shareId: string): Promise<void> =>
    api.delete(`/api/projects/${projectId}/share/${shareId}`).then(() => undefined),

  getShared: (token: string): Promise<SharedProject> =>
    api.get(`/api/share/${token}`).then((r) => r.data),
}

export default projectService
