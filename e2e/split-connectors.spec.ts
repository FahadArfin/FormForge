import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'
import { createDocument, createNode, vec3 } from '../packages/model/src/defaults'
import type { ModelDocument } from '../packages/model/src/types'

const phone = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 980

async function closeDrawer(page: Page) {
  if (phone(page)) await page.getByRole('button', { name: /^Close inspector/ }).click()
}

async function reopenDrawer(page: Page) {
  if (phone(page)) await page.getByRole('button', { name: 'Inspector', exact: true }).click()
}

async function command(page: Page, name: string) {
  await page.getByRole('button', { name: 'Find a command', exact: true }).click()
  await page.getByRole('combobox', { name: 'Search commands' }).fill(name)
  await page.getByRole('option').getByRole('button', { name: new RegExp(name) }).click()
}

async function backup(page: Page): Promise<ModelDocument> {
  await page.getByRole('button', { name: 'Project actions', exact: true }).click()
  await page.getByRole('button', { name: /Download an editable backup/ }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download editable backup', exact: true }).click()
  const download = await pending
  const document = JSON.parse(await readFile((await download.path())!, 'utf8')) as ModelDocument
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  return document
}

for (const connector of [
  { label: 'Dowel pins', parts: 4, pins: true },
  { label: 'Sliding dovetail', parts: 2, pins: false },
] as const) {
  test(`${connector.label} preview preserves the model and apply keeps an editable recovery checkpoint`, async ({ page }, info) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const source = createDocument(`${connector.label} recovery test`)
    const cube = createNode('box', 'add', vec3(0, 0, 20))
    cube.name = 'Editable source cube'
    cube.parameters.width = 40
    cube.parameters.depth = 40
    cube.parameters.height = 40
    source.nodes = [cube]

    await page.goto('/#projects')
    await page.getByLabel('Import a model or project').setInputFiles({
      name: 'split-source.forge.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(source)),
    })
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(source.name)
    const edit = page.getByRole('button', { name: 'Edit model', exact: true })
    if (await edit.isVisible()) await edit.click()
    await expect(page.locator('.engine-status')).toContainText('Live preview ready', { timeout: 65_000 })
    const before = await backup(page)

    await command(page, 'Split into printable pieces')
    await expect(page.getByRole('heading', { name: 'Split into closed parts', exact: true })).toBeVisible()
    await page.getByLabel('Section axis', { exact: true }).selectOption('z')
    const position = page.getByLabel('Plane position (millimeters)', { exact: true })
    await position.fill('20')
    await position.press('Tab')
    const panel = page.locator('.split-panel')
    await panel.getByLabel('Connector', { exact: true }).selectOption({ label: connector.label })
    const preview = panel.getByRole('button', { name: 'Preview split', exact: true })
    const apply = panel.getByRole('button', { name: 'Apply split', exact: true })
    await preview.click()
    await expect(apply).toBeVisible({ timeout: 65_000 })
    await expect(panel.getByRole('img', { name: 'Positive half preview', exact: true })).toBeVisible()
    const part = panel.getByLabel('Preview part', { exact: true })
    await part.selectOption({ label: 'Negative half' })
    await expect(panel.getByRole('img', { name: 'Negative half preview', exact: true })).toBeVisible()
    await panel.getByRole('img', { name: 'Negative half preview', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('connector-negative-preview.png') })
    if (connector.pins) {
      for (const label of ['Dowel pin 1', 'Dowel pin 2']) {
        await part.selectOption({ label })
        await expect(panel.getByRole('img', { name: /^Dowel pin(?: \d+)? preview$/ })).toBeVisible()
      }
      await panel.getByRole('img', { name: /^Dowel pin(?: \d+)? preview$/ }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('connector-pin-preview.png') })
    }
    await part.selectOption({ label: 'Positive half' })
    await expect(panel.getByRole('img', { name: 'Positive half preview', exact: true })).toBeVisible()
    await panel.getByRole('img', { name: 'Positive half preview', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('connector-preview.png') })

    // A computed preview must not replace the editable source document.
    await closeDrawer(page)
    expect((await backup(page)).nodes).toEqual(before.nodes)
    await reopenDrawer(page)
    await panel.getByRole('button', { name: 'Discard preview', exact: true }).click()
    await expect(apply).toHaveCount(0)
    await expect(panel.getByRole('img', { name: 'Positive half preview', exact: true })).toHaveCount(0)
    await preview.click()
    await expect(apply).toBeVisible({ timeout: 65_000 })

    if (connector.pins) {
      // An intervening plane edit must invalidate both displayed geometry and Apply.
      await position.fill('19')
      await position.press('Tab')
      await expect(apply).toHaveCount(0)
      await position.fill('20')
      await position.press('Tab')
      await preview.click()
      await expect(apply).toBeVisible({ timeout: 65_000 })
    }

    await apply.click()
    await expect(panel.getByRole('status')).toContainText(/checkpoint saved/i, { timeout: 65_000 })
    await closeDrawer(page)
    await expect(page.locator('.engine-status')).toContainText('Live preview ready', { timeout: 65_000 })
    const split = await backup(page)
    expect(split.nodes).toHaveLength(connector.parts)
    expect(split.nodes.every(node => node.kind === 'mesh' && node.mesh && node.mesh.indices.length > 0 && node.mesh.positions.length > 0)).toBe(true)
    expect(split.nodes.some(node => node.id === cube.id)).toBe(false)
    expect(new Set(split.nodes.map(node => node.id)).size).toBe(connector.parts)

    // Evaluate and export the whole document: touching halves must not fuse back
    // into a single solid when the geometry engine prepares printable files.
    await command(page, 'Export separate parts and manifest')
    const exportDialog = page.getByRole('dialog', { name: 'Export separate parts', exact: true })
    const downloadParts = exportDialog.getByRole('button', { name: 'Download parts ZIP', exact: true })
    await expect(downloadParts).toBeEnabled({ timeout: 65_000 })
    await expect(exportDialog.locator('tbody tr')).toHaveCount(connector.parts)
    await exportDialog.getByLabel('Part format', { exact: true }).selectOption('stl')
    const pendingParts = page.waitForEvent('download')
    await downloadParts.click()
    const files = unzipSync(new Uint8Array(await readFile((await (await pendingParts).path())!)))
    const stls = Object.entries(files).filter(([name]) => name.endsWith('.stl'))
    expect(stls).toHaveLength(connector.parts)
    const bounds = stls.map(([, bytes]) => {
      expect(bytes.byteLength).toBeGreaterThan(84)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const triangles = view.getUint32(80, true)
      expect(triangles).toBeGreaterThan(0)
      expect(bytes.byteLength).toBe(84 + 50 * triangles)
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, finite = true
      for (let triangle = 0; triangle < triangles; triangle += 1) {
        for (let vertex = 0; vertex < 3; vertex += 1) {
          const offset = 84 + triangle * 50 + 12 + vertex * 12
          const x = view.getFloat32(offset, true), z = view.getFloat32(offset + 8, true)
          finite &&= Number.isFinite(x) && Number.isFinite(z)
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z)
        }
      }
      expect(finite).toBe(true)
      expect(minZ).toBeCloseTo(0, 4)
      return { minX, maxX }
    }).sort((a, b) => a.minX - b.minX)
    for (let index = 1; index < bounds.length; index += 1) {
      expect(bounds[index]!.minX - bounds[index - 1]!.maxX).toBeGreaterThanOrEqual(7.99)
    }
    await exportDialog.getByRole('button', { name: 'Close dialog', exact: true }).click()

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    expect((await backup(page)).nodes).toEqual(before.nodes)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    expect((await backup(page)).nodes).toEqual(split.nodes)

    // Checkpoint restore is independent of session Undo and survives reopening the project.
    await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible()
    await page.reload()
    expect((await backup(page)).nodes).toEqual(split.nodes)
    await command(page, 'Browse edit history')
    const checkpoint = page.locator('.checkpoint-list article').filter({
      has: page.getByRole('heading', { name: 'Before split with connectors', exact: true }),
    })
    await expect(checkpoint).toBeVisible()
    await checkpoint.getByRole('button', { name: 'Restore Before split with connectors', exact: true }).click()
    await expect(page.locator('.checkpoint-review').getByRole('status').filter({ hasText: 'Restored “Before split with connectors”' })).toBeVisible()
    await closeDrawer(page)
    expect((await backup(page)).nodes).toEqual(before.nodes)
    expect(errors).toEqual([])
  })
}
