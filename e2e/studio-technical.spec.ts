import {test,expect,type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'
const phone=(page:Page)=>(page.viewportSize()?.width??1440)<981
async function starter(page:Page){await page.goto('/#studio?starter=washer');await page.getByRole('button',{name:'Use this template',exact:true}).click();await expect(page.getByRole('dialog',{name:'Start with a useful part',exact:true})).toHaveCount(0);await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')}
async function command(page:Page,name:string){if(phone(page)&&await page.getByRole('button',{name:'Close inspector ×',exact:true}).isVisible())await closeDrawer(page);await page.getByRole('button',{name:'Find a command',exact:true}).click();await page.getByRole('combobox',{name:'Search commands'}).fill(name);await page.getByRole('option').getByRole('button',{name:new RegExp(name)}).click()}
async function closeDrawer(page:Page){if(phone(page))await page.getByRole('button',{name:'Close inspector ×',exact:true}).click()}

test('manual rebuilding keeps edits, history restores geometry, and explicit rebuild catches up',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page)
 await command(page,'Choose automatic or manual rebuilding');await page.getByLabel('Update the solid preview').selectOption('manual');await closeDrawer(page)
 if(phone(page))await page.getByRole('button',{name:'Dimensions',exact:true}).click();else await page.getByRole('button',{name:'Model',exact:true}).click()
 await page.getByLabel('Outer diameter',{exact:true}).fill('40');await page.getByRole('button',{name:'Apply dimensions',exact:true}).click();await closeDrawer(page)
 await expect(page.getByText('Preview needs a rebuild',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Rebuild now',exact:true})).toBeEnabled()
 await command(page,'Browse edit history');const history=page.getByRole('list',{name:'Session edit history'});await expect(history).toContainText('Edit parameters');await history.getByRole('button').first().click();await expect(history).toContainText('Redo 1 edit');await history.getByRole('button').last().click();await closeDrawer(page)
 await page.getByRole('button',{name:'Rebuild now',exact:true}).click();await expect(page.getByText('Preview needs a rebuild',{exact:true})).toHaveCount(0);await expect(page.locator('.engine-status')).toContainText('Live preview ready');expect(errors).toEqual([])
})

test('evaluated properties produce a scoped report and circle measurement remains reachable on phones',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page);await command(page,'Evaluate part properties');await page.getByRole('button',{name:'Calculate properties',exact:true}).click()
 await expect(page.getByText('Properties calculated for the whole model.',{exact:true})).toBeVisible();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON report',exact:true}).click();const report=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(report.scope).toBe('whole');expect(report.properties.volume).toBeGreaterThan(0);expect(report.properties.centroid.z).toBeCloseTo(2.5)
 await command(page,'Measure circle diameter');await page.getByRole('button',{name:'Measure circle',exact:true}).click();const prompt=page.locator('.canvas-task-prompt');await expect(prompt).toContainText('0/3 circle points');await expect(prompt.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();await prompt.getByRole('button',{name:'Cancel',exact:true}).click();await expect(prompt).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([])
})

test('precise group transforms stay drafts until Apply and Undo restores the complete group',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page);if(phone(page))await page.getByRole('button',{name:'Dimensions',exact:true}).click();await page.getByRole('button',{name:'Select Spacer outer',exact:true}).click();await closeDrawer(page)
 await command(page,'Precise assembly transform');await expect(page.locator('.precision-transform')).toContainText('2 shapes will move together');const x=page.getByLabel('Assembly move X (millimeters)',{exact:true});await x.fill('1/2 in');await x.press('Tab');await expect(x).toHaveValue('12.7');await page.getByRole('button',{name:'Reset values',exact:true}).click();await expect(x).toHaveValue('0');await x.fill('5');await x.press('Tab');await page.getByRole('button',{name:'Apply transform',exact:true}).click();await closeDrawer(page)
 await expect(page.getByRole('button',{name:'Undo',exact:true})).toHaveAttribute('title',/Move 2 shapes/);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Redo',exact:true})).toHaveAttribute('title',/Move 2 shapes/);expect(errors).toEqual([])
})
