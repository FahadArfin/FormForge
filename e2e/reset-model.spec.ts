import { test, expect, type Page } from '@playwright/test'
import { createDocument, createNode } from '../packages/model/src/defaults'

async function savedModel(page: Page, id: string) {
  return page.evaluate(id => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open('formforge')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result, read = db.transaction('projects').objectStore('projects').get(id)
      read.onsuccess = () => { resolve(read.result?.document); db.close() }
      read.onerror = () => { reject(read.error); db.close() }
    }
  }), id)
}

test('Reset beside Undo confirms, clears, restores and saves the current project', async ({ page }, info) => {
  const doc = createDocument('Reset regression')
  const sphere = createNode('sphere'); sphere.visible = false
  doc.nodes[0]!.locked = true
  doc.nodes.push(sphere)
  await page.goto('/#projects')
  await page.getByLabel('Import a model or project').setInputFiles({ name: 'reset.forge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(doc.name)
  const trigger = page.locator('.studio-history').getByRole('button', { name: 'Reset build plate', exact: true })
  await expect(trigger).toBeVisible()
  const bounds = (await trigger.boundingBox())!, redoBounds = (await page.getByRole('button', { name: 'Redo', exact: true }).boundingBox())!
  expect(bounds.x).toBeGreaterThan(redoBounds.x)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Reset the build plate?' })
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused()
  await page.screenshot({ path: info.outputPath('reset-confirmation.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect.poll(async () => (await savedModel(page, doc.id))?.nodes.length).toBe(2)
  await trigger.click()
  await dialog.getByRole('button', { name: 'Reset build plate', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'What will you make?' })).toBeVisible()
  await expect(trigger).toBeDisabled()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(doc.name)
  await expect.poll(async () => (await savedModel(page, doc.id))?.nodes.length).toBe(0)
  expect((await savedModel(page, doc.id)).printer).toEqual(doc.printer)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(trigger).toBeEnabled()
  await expect.poll(async () => (await savedModel(page, doc.id))?.nodes).toEqual(doc.nodes)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(async () => (await savedModel(page, doc.id))?.nodes.length).toBe(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What will you make?' })).toBeVisible()
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(doc.name)
})
