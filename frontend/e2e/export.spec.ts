import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { openProject } from './support'

/**
 * File > Export on the real app and backend. Each download is opened and its
 * content checked against the plan: this proves the file is the right kind and
 * carries this plan's rooms, not merely that something downloaded. (Reading the
 * files back with independent parsers is PR 3's job.)
 */
const ROOMS = ['Kitchen', 'Living Room', 'Entry', 'Corridor', 'Bedroom 1', 'Bathroom', 'Bedroom 2']

async function download(page: Page, item: RegExp) {
  await page.getByRole('menuitem', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Export' }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: item }).click()
  const file = await pending
  return { name: file.suggestedFilename(), data: await readFile((await file.path())!) }
}

test.describe('export', () => {
  test.beforeEach(async ({ page, projectId }) => {
    await openProject(page, projectId)
  })

  test('DXF: AutoCAD file with the plan layers and every room', async ({ page }) => {
    const { name, data } = await download(page, /^DXF/)
    expect(name).toMatch(/\.dxf$/)
    const text = data.toString('utf8')
    expect(text).toContain('SECTION')
    for (const layer of ['A-WALL', 'A-DOOR', 'A-GLAZ', 'A-AREA-IDEN']) expect(text, layer).toContain(layer)
    for (const room of ROOMS) expect(text, room).toContain(room)
  })

  test('IFC: BIM file with a building storey, walls and a space per room', async ({ page }) => {
    const { name, data } = await download(page, /^IFC/)
    expect(name).toMatch(/\.ifc$/)
    const text = data.toString('utf8')
    expect(text.startsWith('ISO-10303-21')).toBe(true)
    expect(text).toContain('IFCBUILDINGSTOREY')
    expect(text).toContain('IFCWALL')
    expect(text.match(/IFCSPACE\(/g)?.length, 'one IfcSpace per room').toBe(ROOMS.length)
    for (const room of ROOMS) expect(text, room).toContain(room)
  })

  test('GLB, OBJ and SVG: right file signature and, for SVG, the room names', async ({ page }) => {
    const glb = await download(page, /^GLB/)
    expect(glb.data.subarray(0, 4).toString('ascii')).toBe('glTF')

    const obj = await download(page, /^OBJ/)
    expect(obj.name).toMatch(/\.zip$/)
    expect(obj.data.subarray(0, 2).toString('ascii')).toBe('PK')

    const svg = await download(page, /^SVG/)
    const text = svg.data.toString('utf8')
    expect(text).toContain('<svg')
    for (const room of ROOMS) expect(text, room).toContain(room)
  })

  test('PNG and PDF come from the browser with their file signatures', async ({ page }) => {
    const png = await download(page, /^PNG/)
    expect(png.data.subarray(1, 4).toString('ascii')).toBe('PNG')
    const pdf = await download(page, /^PDF/)
    expect(pdf.data.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })
})
