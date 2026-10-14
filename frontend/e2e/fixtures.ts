import { test as base } from '@playwright/test'
import { accessToken, API, createGeneratedProject } from './support'

/**
 * `projectId`: a fresh project holding a generated plan, deleted when the test
 * ends (the free plan allows three projects, and tests must not depend on each
 * other's leftovers).
 */
export const test = base.extend<{ token: string; projectId: string }>({
  token: async ({ page }, use) => use(await accessToken(page)),
  projectId: async ({ request, token }, use, testInfo) => {
    const id = await createGeneratedProject(request, token, testInfo.title.slice(0, 60))
    await use(id)
    await request.delete(`${API}/api/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } })
  },
})

export { expect } from '@playwright/test'
