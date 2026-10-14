import { expect, test } from './fixtures'
import {
  expectAutosaved, field, inspectorValues, openProject, planObjects, redoButton, selectRoom,
  setLabel, setNumber, undoButton,
} from './support'

/**
 * Regression coverage for the editing behaviour architects rely on: selecting,
 * snapping, hosted doors, wall/door/open connections and undo/redo. Everything
 * is driven by labelled controls, never by canvas coordinates.
 */
test.describe('plan editing', () => {
  test.beforeEach(async ({ page, projectId }) => {
    await openProject(page, projectId)
  })

  test('selecting: rooms from the list, walls and doors from the keyboard layer', async ({ page }) => {
    await selectRoom(page, 'Kitchen')
    await expect(field(page, 'Object type')).toHaveValue('room')
    await selectRoom(page, 'Bedroom 1')
    await expect(field(page, 'Room use')).toHaveValue('bedroom')

    await page.getByTestId('plan-object-w8').first().dispatchEvent('click')
    await expect(field(page, 'Object type')).toHaveValue('wall')
    await expect(field(page, 'Object label')).toHaveValue('Wall 8')

    await page.getByTestId('plan-object-d1').first().dispatchEvent('click')
    await expect(field(page, 'Object type')).toHaveValue('door')
    await expect(field(page, 'Door position along wall')).toBeVisible()
  })

  test('snapping: a small resize snaps back onto the neighbours; a large one does not', async ({ page }) => {
    await selectRoom(page, 'Kitchen')
    const original = Number(await field(page, 'Width').inputValue())

    // Within the 0.45 m edge-snap distance: the edge returns to its neighbour.
    await setNumber(page, 'Width', Math.round((original - 0.3) * 10) / 10)
    await expect.poll(async () => Number(await field(page, 'Width').inputValue())).toBeCloseTo(original, 2)

    // Beyond it: the new width stays.
    await setNumber(page, 'Width', 2.5)
    await expect.poll(async () => Number(await field(page, 'Width').inputValue())).toBeCloseTo(2.5, 1)
  })

  test('a door slides along its wall and keeps its place after a reload', async ({ page }) => {
    await selectRoom(page, 'Bedroom 1')
    await page.getByRole('button', { name: 'Move door' }).first().click()
    await expect(field(page, 'Object type')).toHaveValue('door')

    const slide = field(page, 'Door position along wall')
    const before = await inspectorValues(page, ['Position X', 'Position Z'])
    await expect(slide).toHaveValue('0.5')
    await setNumber(page, 'Door position along wall', 0.2)
    await expect(slide).toHaveValue('0.2')
    const moved = await inspectorValues(page, ['Position X', 'Position Z'])
    expect(moved, 'the door moved along its wall').not.toEqual(before)
    await expectAutosaved(page)

    await page.reload()
    await page.getByTestId('plan-object-win1').first().waitFor({ state: 'attached' })
    await selectRoom(page, 'Bedroom 1')
    await page.getByRole('button', { name: 'Move door' }).first().click()
    await expect(field(page, 'Door position along wall')).toHaveValue('0.2')
    expect(await inspectorValues(page, ['Position X', 'Position Z'])).toEqual(moved)
  })

  test('walls: choose wall, door or open between two rooms; it persists and undoes', async ({ page }) => {
    await selectRoom(page, 'Kitchen')
    const toLiving = page.getByRole('radiogroup', { name: 'Connection to Living Room' })
    const was = await toLiving.getByRole('radio', { checked: true }).innerText()
    // The engine opens kitchen and living room; pick a different kind than it chose.
    const target = was === 'Wall' ? 'Open' : 'Wall'
    const choice = toLiving.getByRole('radio', { name: target })

    const objectsBefore = await planObjects(page)
    await choice.click()
    await expect(choice).toBeChecked()
    // The backend rebuilds the derived walls and doors, so the plan changes a moment later.
    await expect.poll(() => planObjects(page), 'the shared wall/door/opening is rebuilt').not.toEqual(objectsBefore)

    // One undo restores the previous kind, redo brings the choice back.
    await undoButton(page).click()
    await expect(toLiving.getByRole('radio', { name: was })).toBeChecked()
    await redoButton(page).click()
    await expect(choice).toBeChecked()

    // It is saved with the plan.
    await expectAutosaved(page)
    await page.reload()
    await page.getByTestId('plan-object-win1').first().waitFor({ state: 'attached' })
    await selectRoom(page, 'Kitchen')
    await expect(page.getByRole('radiogroup', { name: 'Connection to Living Room' }).getByRole('radio', { name: target })).toBeChecked()
  })

  test('undo and redo walk an edit back and forth, from the button and the keyboard', async ({ page }) => {
    await selectRoom(page, 'Kitchen')
    const label = field(page, 'Object label')
    await setLabel(page, 'Galley')
    await expect(label).toHaveValue('Galley')

    await undoButton(page).click()
    await expect(label).toHaveValue('Kitchen')
    await redoButton(page).click()
    await expect(label).toHaveValue('Galley')

    // Keyboard: use a control that takes focus out of any text field first.
    await page.getByRole('button', { name: 'Zoom to fit' }).click()
    await page.keyboard.press('Control+z')
    await expect(label).toHaveValue('Kitchen')
    await page.keyboard.press('Control+Shift+z')
    await expect(label).toHaveValue('Galley')
  })
})
