import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const API = 'http://localhost:8001'

/** A small brief the layout engine always fits (same shape the backend tests use). */
export const BRIEF = {
  building_type: 'apartment',
  floors: 1,
  rooms: [
    { type: 'bedroom', count: 2 },
    { type: 'kitchen', count: 1 },
    { type: 'living_room', count: 1 },
    { type: 'bathroom', count: 1 },
  ],
  plot: { width_m: 10, depth_m: 12 },
  facing: 'east',
}

/** The signed-in user's access token, read from the saved browser session. */
export async function accessToken(page: Page): Promise<string> {
  await page.goto('/projects')
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      const value = localStorage.getItem(key)!
      if (/token/i.test(key) && !/refresh/i.test(key)) return value
    }
    return null
  })
  expect(token, 'a saved access token').toBeTruthy()
  return token!
}

/**
 * A project holding a plan the real engine generated from BRIEF: created and
 * generated through the API, exactly as the app does, so each test starts from
 * a known saved design without depending on the UI to get there.
 */
export async function createGeneratedProject(request: APIRequestContext, token: string, title: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const project = await request.post(`${API}/api/projects`, { headers, data: { title } })
  expect(project.ok(), 'create project').toBeTruthy()
  const { id } = await project.json()
  const generated = await request.post(`${API}/api/generate`, {
    headers,
    data: { requirements: BRIEF, useDefaults: true, projectId: id },
  })
  expect(generated.ok(), `generate: ${await generated.text()}`).toBeTruthy()
  return id as string
}

/** Rooms in the saved latest design, straight from the database via the API. */
export async function savedRooms(request: APIRequestContext, token: string, projectId: string) {
  const response = await request.get(`${API}/api/design/project/${projectId}/latest`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), 'load latest design').toBeTruthy()
  return (await response.json()) as { rooms: { id: string; label: string; roomType?: string; position: { x: number; z: number }; size: { w: number; d: number } }[]; [k: string]: unknown }
}

/** Opens a project in the plan editor and waits until the plan has rendered. */
export async function openProject(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?view=2d`)
  await page.getByTestId('plan-object-r1').first().waitFor({ state: 'attached' })
  await expect(page.getByRole('button', { name: /^Kitchen/ }).last()).toBeVisible()
  // Windows are derived by the backend after load; wait so snapshots are complete.
  await page.getByTestId('plan-object-win1').first().waitFor({ state: 'attached' })
}

/** Selects a room from the room list in the right panel (no canvas coordinates). */
export async function selectRoom(page: Page, label: string) {
  await page.getByRole('button', { name: new RegExp('^' + label) }).last().click()
  await expect(page.getByLabel('Object label')).toHaveValue(label)
}

/** The inspector input with this accessible name. */
export const field = (page: Page, name: string) => page.getByLabel(name, { exact: true })

/** Sets a numeric inspector field and commits it (Enter), as a user would. */
export async function setNumber(page: Page, name: string, value: number) {
  const input = field(page, name)
  await input.fill(String(value))
  await input.press('Enter')
}

/** Autosave has stored the latest edit (the header badge reads "Auto-saved …"). */
export async function expectAutosaved(page: Page) {
  await expect(page.getByText(/^Auto-saved/).first()).toBeVisible({ timeout: 30_000 })
}

/**
 * Everything the plan currently shows, as data: each object's id and accessible
 * name (rooms, walls, doors, windows). Equal before and after a reload means
 * the saved geometry came back the same.
 */
export async function planObjects(page: Page) {
  return page.locator('[data-testid^="plan-object-"]').evaluateAll((els) =>
    els
      .map((el) => `${el.getAttribute('data-testid')!.replace('plan-object-', '')}: ${el.getAttribute('aria-label')}`)
      .sort(),
  )
}

/** Inspector values of the selected object, for geometry comparisons. */
export async function inspectorValues(page: Page, names: string[]) {
  const values: Record<string, string> = {}
  for (const name of names) values[name] = await field(page, name).inputValue()
  return values
}

/** The Undo button in the dock (the one that is not a menu item). */
export const undoButton = (page: Page) => page.getByRole('button', { name: /^Undo/ })
export const redoButton = (page: Page) => page.getByRole('button', { name: /^Redo/ })
