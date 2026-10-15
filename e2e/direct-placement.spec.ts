import { test, expect, type Page } from '@playwright/test'
import { createDocument, createNode } from '../packages/model/src/defaults'
import { readFile } from 'node:fs/promises'

const phone = (page: Page) => page.viewportSize()!.width < 981
async function emptyProject(page: Page, custom?: ReturnType<typeof createDocument>) {
  await page.goto('/#projects')
  const doc = custom ?? { ...createDocument(), nodes: [] }; doc.name = 'Direct placement regression'
  await page.getByLabel('Import a model or project').setInputFiles({ name: 'placement.forge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.getByLabel('Project name', { exact: true })).toHaveValue(doc.name)
  const edit = page.getByRole('button', { name: 'Edit model', exact: true })
  if (await edit.isVisible()) await edit.click()
  await page.getByRole('combobox', { name: 'Camera view' }).selectOption('top')
}
async function pick(page: Page, name: string) {
  if (phone(page)) await page.getByRole('button', { name: 'Build tools', exact: true }).click()
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel placement', exact: true })).toBeVisible()
  if (phone(page)) await expect(page.getByRole('button', { name: 'Close build tools', exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Place in workspace', exact: true })).toHaveCount(0)
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

test('pick → cursor preview → draw size → drag body → undo/redo and saved reload', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await emptyProject(page)
  await pick(page, 'Box')
  const canvas = page.locator('.viewport-canvas canvas'), host = page.getByRole('region', { name: '3D modeling viewport' })
  const bounds = (await canvas.boundingBox())!, x = bounds.x + bounds.width * .35, y = bounds.y + bounds.height * .45
  await page.mouse.move(x, y)
  await expect(host).toHaveAttribute('data-placement-size', /mm$/)
  await page.mouse.down(); await page.mouse.move(x + 90, y + 65, { steps: 8 })
  const draftSize = await host.getAttribute('data-placement-size')
  await page.mouse.up()
  const height = page.getByRole('spinbutton', {name:'Placement height'})
  await expect(height).toBeVisible()
  await page.mouse.move(x + 90, y + 15, {steps:5})
  await expect(height).not.toHaveValue('18')
  await height.fill('45')
  await expect(host).toHaveAttribute('data-placement-size', /45.0 mm$/)
  await page.getByRole('button',{name:'Display options',exact:true}).click()
  const xray=page.getByRole('button',{name:/X-ray/})
  await xray.click();await xray.click()
  await page.getByRole('button',{name:'Display options',exact:true}).click()
  await expect(height).toHaveValue('45')
  await page.screenshot({path:testInfo.outputPath('height-before-placement.png')})
  await page.getByRole('button', {name:'Finish shape',exact:true}).click()
  await expect(page.getByRole('button', { name: 'Cancel placement', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resize shape', exact: true })).toBeVisible()
  const placed = await backup(page)
  expect(placed.nodes).toHaveLength(1)
  expect(placed.nodes[0].parameters.width).not.toBe(28)
  expect(placed.nodes[0].parameters.height).toBe(45)
  expect(draftSize).toContain(`${placed.nodes[0].parameters.width.toFixed(1)} ×`)
  await page.screenshot({ path: testInfo.outputPath('placed-shape.png') })
  const origin = placed.nodes[0].transform.position
  // The newly placed object remains directly movable, with no tool change.
  await page.mouse.move(x + 45, y + 32); await page.mouse.down(); await page.mouse.move(x + 100, y + 32, { steps: 8 }); await page.mouse.up()
  const moved = await backup(page)
  expect(moved.nodes[0].transform.position.x).not.toBe(origin.x)
  expect(moved.nodes[0].transform.position.z).toBeCloseTo(origin.z, 8)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await backup(page)).nodes[0].transform.position).toEqual(origin)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('.engine-status')).toContainText('Live preview ready')
  await page.getByRole('button', { name: 'Solid result', exact: true }).click()
  await page.mouse.move(x + 100, y + 32); await page.mouse.down(); await page.mouse.move(x + 120, y + 32); await page.mouse.up()
  expect((await backup(page)).nodes[0].transform.position.x).not.toBe(moved.nodes[0].transform.position.x)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved on this device', exact: true })).toBeVisible()
  await page.reload()
  expect((await backup(page)).nodes).toEqual(moved.nodes)
  expect(errors).toEqual([])
})

test('click placement, Escape, and interrupted pointer gestures preserve the project', async ({ page }) => {
  test.setTimeout(120_000)
  await emptyProject(page)
  await pick(page, 'Sphere')
  const canvas = page.locator('.viewport-canvas canvas'), b = (await canvas.boundingBox())!, x = b.x + b.width / 2, y = b.y + b.height / 2
  if (phone(page)) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y)
  expect((await backup(page)).nodes).toHaveLength(1)
  await pick(page, 'Box')
  await page.mouse.move(x + 60, y); await page.mouse.down(); await page.mouse.move(x + 100, y + 40)
  await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Cancel placement', exact: true })).toHaveCount(0)
  expect((await backup(page)).nodes).toHaveLength(1)
  await pick(page, 'Cylinder'); await page.keyboard.press('Escape')
  expect((await backup(page)).nodes).toHaveLength(1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect((await backup(page)).nodes).toHaveLength(0)
})

test('height placement cancels from its field and touch or mouse can raise a cylinder', async ({page},info) => {
  test.setTimeout(120000)
  await emptyProject(page)
  const canvas=page.locator('.viewport-canvas canvas')
  const b=(await canvas.boundingBox())!, x=b.x+b.width*.35,y=b.y+b.height*.36
  await pick(page,'Box')
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y+30,{steps:5});await page.mouse.up()
  const height=page.getByRole('spinbutton',{name:'Placement height'})
  await height.fill('67');await height.press('Escape')
  await expect(page.getByRole('button',{name:'Cancel placement',exact:true})).toHaveCount(0)
  expect((await backup(page)).nodes).toHaveLength(0)
  await pick(page,'Cylinder')
  const touch=phone(page)?await page.context().newCDPSession(page):null
  const drag=async(ax:number,ay:number,bx:number,by:number)=>{
    if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ax,y:ay}]});for(let i=1;i<=5;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ax+(bx-ax)*i/5,y:ay+(by-ay)*i/5}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
    else{await page.mouse.move(ax,ay);await page.mouse.down();await page.mouse.move(bx,by,{steps:5});await page.mouse.up()}
  }
  await drag(x,y,x+45,y+20)
  await expect(height).toHaveValue('28')
  await height.fill('0');await expect(page.getByRole('button',{name:'Finish shape',exact:true})).toBeDisabled()
  await height.fill('28')
  await drag(x+10,y+25,x+10,y-20)
  await expect(height).toHaveCount(0)
  const placed=await backup(page)
  expect(placed.nodes[0].parameters.height).toBeGreaterThan(28)
  expect(placed.nodes[0].transform.position.z).toBeCloseTo(placed.nodes[0].parameters.height/2)
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  expect((await backup(page)).nodes).toHaveLength(0)
  await page.getByRole('button',{name:'Redo',exact:true}).click()
  expect((await backup(page)).nodes).toEqual(placed.nodes)
  await page.getByRole('combobox',{name:'Camera view'}).selectOption('iso')
  await page.screenshot({path:info.outputPath('drawn-cylinder-height.png')})
  await touch?.detach()
})


test('body dragging follows a vertical workplane and empty Boolean holes remain empty canvas', async ({ page }) => {
  test.setTimeout(120_000)
  const vertical = createDocument(); vertical.nodes = []
  vertical.workplane = { name: 'XZ', origin: { x: 0, y: -30, z: 0 }, normal: { x: 0, y: -1, z: 0 }, xAxis: { x: 1, y: 0, z: 0 } }
  await emptyProject(page, vertical)
  await page.getByRole('combobox', { name: 'Camera view' }).selectOption('front')
  await pick(page, 'Box')
  const canvas = page.locator('.viewport-canvas canvas'), b = (await canvas.boundingBox())!, x = b.x + b.width * .55, y = b.y + b.height * .4
  await page.mouse.click(x, y)
  const placed = await backup(page)
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y - 20, { steps: 8 }); await page.mouse.up()
  const moved = await backup(page)
  expect(moved.nodes[0].transform.position.y).toBeCloseTo(placed.nodes[0].transform.position.y)
  expect(moved.nodes[0].transform.position.x).not.toBe(placed.nodes[0].transform.position.x)
  const ring = createDocument(), box = createNode('box'), hole = createNode('cylinder', 'cut')
  box.parameters = { ...box.parameters, width: 100, depth: 100, height: 10 }; box.transform.position.z = 5
  hole.parameters = { ...hole.parameters, radius: 25, height: 30 }; hole.transform.position.z = 5
  ring.nodes = [box, hole]
  await emptyProject(page, ring)
  await expect(page.locator('.engine-status')).toContainText('Live preview ready')
  await page.getByRole('button', { name: 'Solid result', exact: true }).click()
  await page.getByRole('button', { name: 'Fit all', exact: true }).click()
  const c = (await canvas.boundingBox())!, cx = c.x + c.width / 2, cy = c.y + c.height / 2
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 12, cy + 8, { steps: 5 }); await page.mouse.up()
  expect((await backup(page)).nodes).toEqual(ring.nodes)
})
