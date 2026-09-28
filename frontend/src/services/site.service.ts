import api from './api'
import type { SitePoint } from '../site/siteTypes'

/** Upload a DXF; the server returns the largest closed outline in plan metres. */
export async function importSiteDxf(file: File): Promise<SitePoint[]> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ boundary: SitePoint[] }>('/api/site/import-dxf', form)
  return data.boundary
}
