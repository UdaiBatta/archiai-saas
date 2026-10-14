import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { expectAutosaved, openProject, undoButton } from './support'

/**
 * The assistant on the real app and backend, with the LLM replaced by
 * e2e/fake-llm.mjs. Everything after the model's answer (validation, preview,
 * apply) is the real code path: a preview changes nothing, Apply is one
 * undoable edit, and a plan that changed in the meantime is never overwritten.
 */
test.describe('assistant preview and apply', () => {
  test.beforeEach(async ({ page, projectId }) => {
    await openProject(page, projectId)
    await page.getByRole('button', { name: 'Assistant' }).click()
  })

  const ask = async (page: Page, text: string) => {
    await page.getByLabel('Instruction').fill(text)
    await page.getByRole('button', { name: 'Ask' }).click()
    return page.getByRole('region', { name: 'Assistant preview' })
  }

  test('a preview changes nothing until Apply; Apply is one undo step', async ({ page }) => {
    const preview = await ask(page, 'Rename the kitchen to Chef Kitchen')
    await expect(preview).toContainText('Rename Kitchen to Chef Kitchen')
    await expect(preview.getByRole('button', { name: 'Apply' })).toBeVisible()

    // Still the old plan while the preview is open.
    await expect(page.getByRole('button', { name: /^Kitchen/ }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Chef Kitchen/ })).toHaveCount(0)

    await preview.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByRole('button', { name: /^Chef Kitchen/ }).last()).toBeVisible()
    await expect(preview).toBeHidden()
    await expectAutosaved(page)

    await undoButton(page).click()
    await expect(page.getByRole('button', { name: /^Kitchen/ }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Chef Kitchen/ })).toHaveCount(0)
  })

  test('Discard leaves the plan exactly as it was', async ({ page }) => {
    const preview = await ask(page, 'Rename the kitchen to Chef Kitchen')
    await preview.getByRole('button', { name: 'Discard' }).click()
    await expect(preview).toBeHidden()
    await expect(page.getByRole('button', { name: /^Kitchen/ }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Chef Kitchen/ })).toHaveCount(0)
  })

  test('stale-plan protection: a plan that changed since the preview blocks Apply', async ({ page }) => {
    // First edit, applied.
    const first = await ask(page, 'Rename the kitchen to Chef Kitchen')
    await first.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByRole('button', { name: /^Chef Kitchen/ }).last()).toBeVisible()

    // A second preview is open, based on that plan ...
    const second = await ask(page, 'Rename the bedroom 2 to Guest room')
    await expect(second).toContainText('Rename Bedroom 2 to Guest room')

    // ... and the plan changes underneath it (undo of the first edit).
    await undoButton(page).click()
    await expect(page.getByRole('button', { name: /^Kitchen/ }).last()).toBeVisible()

    await second.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByRole('alert')).toContainText('The layout changed while this preview was open')
    // The stale edit was not applied.
    await expect(page.getByRole('button', { name: /^Guest room/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Bedroom 2/ }).last()).toBeVisible()
    await expect(second).toBeHidden()
  })

  test('a question is answered without offering an edit', async ({ page }) => {
    const preview = await ask(page, 'Why is the balcony flagged?')
    await expect(preview).toContainText('The fake model has nothing to add.')
    await expect(preview.getByRole('button', { name: 'Apply' })).toHaveCount(0)
    await expect(preview.getByRole('button', { name: 'Close' })).toBeVisible()
  })
})
