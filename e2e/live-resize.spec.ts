import { test, expect, type Page } from '@playwright/test'
import { createDocument, createNode } from '../packages/model/src/defaults'
import { readFile } from 'node:fs/promises'

async function setup(page: Page) {
  const document = createDocument('Live resize regression'), node = createNode('box')
  node.parameters = { ...node.parameters, width: 80, depth: 12, height: 40 }
  node.transform.position.z = 20; document.nodes = [node]
  await page.goto('/#projects')
  await page.getByLabel('Import a model or project').setInputFiles({ name: 'resize.forge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) })
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(document.name)
  const edit = page.getByRole('button', { name: 'Edit model', exact: true })
  if (await edit.isVisible()) await edit.click()
  await expect(page.locator('.engine-status')).toContainText('Live preview ready')
  await page.getByRole('button', { name: 'Fit all', exact: true }).click()
  const b = (await page.locator('.viewport-canvas canvas').boundingBox())!
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
  await page.getByRole('button', { name: 'Resize shape', exact: true }).click()
  // Positive X handle in the default perspective; gizmo size tracks canvas height.
  return { document, centerX: b.x + b.width / 2, centerY: b.y + b.height / 2, unit: b.height / 720, x: b.x + b.width / 2 + 83 * b.height / 720, y: b.y + b.height / 2 + 32 * b.height / 720 }
}

async function backup(page: Page) {
  await page.getByRole('button', { name: 'Project actions', exact: true }).click()
  await page.getByRole('button', { name: /Download an editable backup/ }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download editable backup', exact: true }).click()
  const document = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  return document
}

test('dimensions follow the held resize handle and commit as one undo step', async ({ page }, testInfo) => {
  const { document, x, y } = await setup(page)
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y + 15, { steps: 8 })
  if (page.viewportSize()!.width > 980) {
    await expect(page.locator('.dimensions-editor').getByRole('textbox', { name: 'Width (millimeters)', exact: true })).not.toHaveValue('80')
    await expect(page.locator('.dimensions-editor').getByRole('textbox', { name: 'Depth (millimeters)', exact: true })).toHaveValue('12')
  }
  const width = page.locator('.resize-dimensions [data-axis="x"]')
  await expect(width).not.toHaveText('80 mm')
  await expect(width).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('live-dimensions-drag.png') })
  const midway = await width.innerText()
  await page.mouse.move(x + 65, y + 24, { steps: 5 })
  await expect(width).not.toHaveText(midway)
  await page.mouse.up()
  const resized = await backup(page)
  expect(resized.nodes[0].transform.scale.x).toBeGreaterThan(1)
  expect(resized.nodes[0].transform.scale.y).toBe(1)
  expect(resized.nodes[0].transform.scale.z).toBe(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await backup(page)).nodes).toEqual(document.nodes)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  expect((await backup(page)).nodes).toEqual(resized.nodes)
})

test('Escape and pointer cancellation restore live dimensions without saving a resize', async ({ page }) => {
  const { document, centerX, centerY, unit } = await setup(page)
  for (const cancel of ['escape', 'pointercancel']) {
    const axis = cancel === 'escape' ? 'y' : 'z', original = axis === 'y' ? '12 mm' : '40 mm'
    const x = centerX + (axis === 'y' ? 63 : 0) * unit, y = centerY + (axis === 'y' ? -32 : -97) * unit
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + (axis === 'y' ? 26 : 0), y - 30, { steps: 6 })
    const size = page.locator(`.resize-dimensions [data-axis="${axis}"]`)
    await expect(size).not.toHaveText(original)
    if (cancel === 'escape') await page.keyboard.press('Escape')
    else await page.locator('.viewport-canvas canvas').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 })
    await page.mouse.up()
    await expect(size).toHaveText(original)
    expect((await backup(page)).nodes).toEqual(document.nodes)
  }
})
