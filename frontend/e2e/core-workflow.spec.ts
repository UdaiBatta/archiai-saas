import { expect, test } from './fixtures'
import {
  expectAutosaved, field, inspectorValues, openProject,
  planObjects, selectRoom, setNumber,
} from './support'

/**
 * The whole loop on the real app: open a generated plan, generate another from
 * the engine, edit, autosave, reload and find the same geometry, then export.
 */
test.describe('core workflow', () => {
  test('edit, autosave, reload: the geometry persists', async ({ page, projectId }) => {
    await openProject(page, projectId)

    const before = await planObjects(page)
    expect(before.filter((o) => /Room$|m²$/.test(o) && /^r\d/.test(o)).length, 'seven rooms from the brief').toBe(7)

    // Edit a room: resize the kitchen.
    await selectRoom(page, 'Kitchen')
    // Far enough that its edges leave the neighbours' snap distance (0.45 m).
    await setNumber(page, 'Width', 2.5)
    await expect.poll(async () => Number(await field(page, 'Width').inputValue())).toBeLessThan(3)
    await expectAutosaved(page)
    const edited = await inspectorValues(page, ['Width', 'Depth', 'Position X', 'Position Z'])
    const afterEdit = await planObjects(page)

    // Reload: the saved plan comes back as it was left, edit included.
    await page.reload()
    await page.getByTestId('plan-object-r1').first().waitFor({ state: 'attached' })
    expect(await planObjects(page)).toEqual(afterEdit)
    await selectRoom(page, 'Kitchen')
    expect(await inspectorValues(page, ['Width', 'Depth', 'Position X', 'Position Z'])).toEqual(edited)
  })

  test('Plan > Options generates a layout from the brief as one undoable edit', async ({ page, projectId }) => {
    await openProject(page, projectId)
    const before = await planObjects(page)

    await page.getByRole('menuitem', { name: 'Plan' }).click()
    await page.getByRole('menuitem', { name: /^Options/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Layout options' })
    await expect(dialog.getByRole('button', { name: 'Use this option' })).toHaveCount(3)
    await dialog.getByRole('button', { name: 'Use this option' }).nth(1).click()
    await expect(dialog).toBeHidden()

    // A different engine layout, still the same programme: seven rooms, valid.
    const generated = await planObjects(page)
    expect(generated.filter((o) => /^r\d/.test(o)).length).toBe(7)
    expect(generated).not.toEqual(before)
    await expect(page.getByText(/Quality\s*100\/100/).first()).toBeVisible()

    // One undo restores the previous plan exactly.
    await page.getByRole('button', { name: /^Undo/ }).click()
    expect(await planObjects(page)).toEqual(before)
  })
})
