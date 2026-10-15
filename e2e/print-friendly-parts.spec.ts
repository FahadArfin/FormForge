import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createDocument } from '../packages/model/src/defaults'

const phone = (page: Page) => page.viewportSize()!.width <= 980
async function openBuilder(page: Page) {
  if (phone(page)) await page.getByRole('button', { name: 'Build tools', exact: true }).click()
  await page.getByRole('button', { name: /^Print-friendly parts Vents/ }).click()
  await expect(page.getByRole('heading', { name: 'Print-friendly parts', exact: true })).toBeVisible()
}
async function closeDrawer(page: Page) {
  if (phone(page)) await page.getByRole('button', { name: /^Close inspector/ }).click()
}
async function backup(page: Page) {
  await page.getByRole('button', { name: 'Project actions', exact: true }).click()
  await page.getByRole('button', { name: /Download an editable backup/ }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download editable backup', exact: true }).click()
  const doc = JSON.parse(await readFile((await (await pending).path())!, 'utf8'))
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  return doc
}

test('print-friendly recipes preview, validate, add editable groups, and undo on desktop and phone', async ({ page }, info) => {
  test.setTimeout(180_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const doc = { ...createDocument('Print-friendly recipe test'), nodes: [] }
  await page.goto('/#projects')
  await page.getByLabel('Import a model or project').setInputFiles({ name: 'print-parts.forge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(doc.name)
  const edit = page.getByRole('button', { name: 'Edit model', exact: true })
  if (await edit.isVisible()) await edit.click()
  await openBuilder(page)
  const panel = page.locator('.print-friendly-parts')
  await panel.getByLabel('Columns', { exact: true }).fill('40')
  await panel.getByRole('button', { name: 'Preview part', exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('whole number')
  await expect(panel.getByRole('button', { name: 'Add editable part', exact: true })).toHaveCount(0)
  await panel.getByLabel('Columns', { exact: true }).fill('4')
  let before = doc.nodes as unknown[]
  for (const [index, recipe] of ['Vented panel', 'Ribbed bracket', 'Insert boss'].entries()) {
    if (index) { await openBuilder(page); await panel.getByRole('button', { name: recipe, exact: true }).click() }
    await panel.getByRole('button', { name: 'Preview part', exact: true }).click()
    const apply = panel.getByRole('button', { name: 'Add editable part', exact: true })
    await expect(apply).toBeVisible({ timeout: 65_000 })
    await panel.getByRole('img', { name: /preview$/ }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`recipe-${index}-preview.png`) })
    if (!index) {
      await panel.getByLabel('Border (mm)', { exact: true }).fill('6')
      await expect(apply).toHaveCount(0)
      await panel.getByRole('button', { name: 'Preview part', exact: true }).click()
      await expect(apply).toBeVisible({ timeout: 65_000 })
    }
    await apply.click()
    await expect(apply).toHaveCount(0)
    await closeDrawer(page)
    await expect(page.locator('.engine-status')).toContainText('Live preview ready', { timeout: 65_000 })
    const added = await backup(page)
    const newNodes = added.nodes.slice(before.length)
    expect(newNodes.length).toBeGreaterThan(2)
    expect(newNodes.every((n: { kind: string }) => n.kind !== 'mesh')).toBe(true)
    expect(new Set(newNodes.map((n: { groupId: string }) => n.groupId)).size).toBe(1)
    expect(added.nodes.slice(0, before.length)).toEqual(before)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    expect((await backup(page)).nodes).toEqual(before)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    expect((await backup(page)).nodes).toEqual(added.nodes)
    before = added.nodes
  }
  await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible()
  await page.reload()
  expect((await backup(page)).nodes).toEqual(before)
  expect(errors).toEqual([])
})
