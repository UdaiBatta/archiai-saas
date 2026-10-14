import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { API, expectAutosaved, field, openProject, selectRoom, setLabel } from './support'

/**
 * Revision-safe saving on the real app, backend and PostgreSQL: two tabs on the
 * same project must not silently overwrite each other.
 */

async function latest(request: import('@playwright/test').APIRequestContext, token: string, projectId: string) {
  const response = await request.get(`${API}/api/design/project/${projectId}/latest`, { headers: { Authorization: `Bearer ${token}` } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { designId: string; revision: number; rooms: { label: string }[] }
}

/** Renames a room in a tab and waits until its autosave has landed. */
async function rename(page: Page, from: string, to: string) {
  await selectRoom(page, from)
  await setLabel(page, to)
  await expect(field(page, 'Object label')).toHaveValue(to)
}

test.describe('revision-safe saving', () => {
  test('simultaneous saves on PostgreSQL have exactly one winner', async ({ request, token, projectId }) => {
    const { designId, revision, ...design } = await latest(request, token, projectId)
    const headers = { Authorization: `Bearer ${token}` }
    const save = (label: string) =>
      request.put(`${API}/api/design/${designId}/draft`, {
        headers,
        data: { layout: { ...design, rooms: design.rooms.map((r, i) => (i === 0 ? { ...r, label } : r)) }, baseRevision: revision },
      })

    const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => save(`Racer ${i}`)))
    const statuses = responses.map((r) => r.status())
    expect(statuses.filter((s) => s === 200), 'one winner').toHaveLength(1)
    expect(statuses.filter((s) => s === 409), 'everyone else is refused').toHaveLength(11)

    const refused = await responses[statuses.indexOf(409)].json()
    expect(refused).toMatchObject({ code: 'REVISION_CONFLICT', currentRevision: revision + 1, baseRevision: revision })

    // One bump, and the stored draft is the winner's, whole.
    expect((await latest(request, token, projectId)).revision).toBe(revision + 1)
    const winner = await responses[statuses.indexOf(200)].json()
    const draft = await request.get(`${API}/api/design/${designId}/draft`, { headers })
    expect((await draft.json()).rooms[0].label).toBe(winner.rooms[0].label)
  })

  test('the second tab keeps its edits and is offered Compare, Save as new version and Reload', async ({ browser, page, projectId }) => {
    // Tab A: open and edit; its autosave lands first.
    await openProject(page, projectId)
    const tabB = await (await browser.newContext({ storageState: 'e2e/.auth/user.json' })).newPage()
    await openProject(tabB, projectId)

    await rename(page, 'Kitchen', 'Chef Kitchen')
    await expectAutosaved(page)

    // Tab B is now out of date. Its own edit is refused instead of overwriting.
    await rename(tabB, 'Bedroom 2', 'Guest room')
    const banner = tabB.getByRole('alert', { name: 'Save conflict' })
    await expect(banner).toBeVisible({ timeout: 30_000 })
    await expect(banner).toContainText('changed somewhere else')
    await expect(tabB.getByText('Not saved: changed elsewhere').first()).toBeVisible()
    await expect(field(tabB, 'Object label'), 'the edit is still on screen').toHaveValue('Guest room')

    // Compare: what differs between this tab and the saved copy.
    await banner.getByRole('button', { name: 'Compare' }).click()
    const differences = banner.getByLabel('Differences')
    await expect(differences).toContainText('Kitchen')
    await expect(differences).toContainText('Guest room')

    // Save as new version: this tab's copy goes on top of the current revision.
    await banner.getByRole('button', { name: 'Save as new version' }).click()
    await expect(banner).toBeHidden()
    await expect(tabB.getByText(/^Saved/).first()).toBeVisible()

    // A reload shows tab B's version (the other copy stays in the version history).
    await tabB.reload()
    await tabB.getByTestId('plan-object-win1').first().waitFor({ state: 'attached' })
    await expect(tabB.getByRole('button', { name: /^Guest room/ }).last()).toBeVisible()
    await expect(tabB.getByRole('button', { name: /^Chef Kitchen/ })).toHaveCount(0)

    // And now tab A is the stale one.
    await rename(page, 'Bedroom 1', 'Nursery')
    await expect(page.getByRole('alert', { name: 'Save conflict' })).toBeVisible({ timeout: 30_000 })
  })

  test('Reload takes the saved copy and drops the edits that were refused', async ({ browser, page, projectId }) => {
    await openProject(page, projectId)
    const tabB = await (await browser.newContext({ storageState: 'e2e/.auth/user.json' })).newPage()
    await openProject(tabB, projectId)

    await rename(page, 'Kitchen', 'Chef Kitchen')
    await expectAutosaved(page)
    await rename(tabB, 'Bedroom 2', 'Guest room')
    const banner = tabB.getByRole('alert', { name: 'Save conflict' })
    await expect(banner).toBeVisible({ timeout: 30_000 })

    tabB.once('dialog', (dialog) => dialog.accept())
    await banner.getByRole('button', { name: 'Reload' }).click()
    await tabB.getByTestId('plan-object-win1').first().waitFor({ state: 'attached' })

    await expect(tabB.getByRole('button', { name: /^Chef Kitchen/ }).last()).toBeVisible()
    await expect(tabB.getByRole('button', { name: /^Guest room/ })).toHaveCount(0)
    await expect(tabB.getByRole('alert', { name: 'Save conflict' })).toHaveCount(0)

    // Loaded fresh, so it can save again.
    await rename(tabB, 'Bedroom 2', 'Study')
    await expectAutosaved(tabB)
  })

  test('declining the Reload confirmation keeps everything as it was', async ({ browser, page, projectId }) => {
    await openProject(page, projectId)
    const tabB = await (await browser.newContext({ storageState: 'e2e/.auth/user.json' })).newPage()
    await openProject(tabB, projectId)

    await rename(page, 'Kitchen', 'Chef Kitchen')
    await expectAutosaved(page)
    await rename(tabB, 'Bedroom 2', 'Guest room')
    const banner = tabB.getByRole('alert', { name: 'Save conflict' })
    await expect(banner).toBeVisible({ timeout: 30_000 })

    tabB.once('dialog', (dialog) => dialog.dismiss())
    await banner.getByRole('button', { name: 'Reload' }).click()
    await expect(banner).toBeVisible()
    await expect(field(tabB, 'Object label')).toHaveValue('Guest room')
  })
})
