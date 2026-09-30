import api from './api'
import type { HousingFillRequest, HousingFillResponse } from '../site/housingTypes'

/** Fill a mass with units (P3). VITE_HOUSING_MOCK=1 uses the local mock solver. */
export async function fillHousing(request: HousingFillRequest): Promise<HousingFillResponse> {
  if (import.meta.env.VITE_HOUSING_MOCK === '1') {
    const { mockHousingFill } = await import('../site/housingFixture')
    return mockHousingFill(request)
  }
  const { data } = await api.post<HousingFillResponse>('/api/housing/fill', request)
  return data
}
