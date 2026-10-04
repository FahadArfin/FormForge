import {test,expect,type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'
import {unzipSync,strFromU8} from 'fflate'
const phone=(page:Page)=>(page.viewportSize()?.width??1440)<981
async function dimensions(page:Page){if(phone(page))await page.getByRole('button',{name:'Dimensions',exact:true}).click()}
async function closeDrawer(page:Page){if(phone(page))await page.getByRole('button',{name:'Close inspector ×',exact:true}).click()}
async function starter(page:Page,id='washer',name='Washer / spacer'){
 await page.goto(`/#studio?starter=${id}`);await page.getByRole('button',{name:'Use this template',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Start with a useful part',exact:true})).toHaveCount(0);await expect(page.getByLabel('Project name',{exact:true})).toHaveValue(name)
}
async function command(page:Page,name:string){await page.getByRole('button',{name:'Find a command',exact:true}).click();await page.getByRole('combobox',{name:'Search commands'}).fill(name);await page.getByRole('option').getByRole('button',{name:new RegExp(name)}).click()}
test('safe rename → two variants → real batch export without changing current geometry',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page);await dimensions(page)
 await page.getByRole('button',{name:'Parameters',exact:true}).click();await page.getByLabel('Rename parameter outer',{exact:true}).fill('Outside diameter');await page.getByLabel('Rename parameter outer',{exact:true}).press('Tab')
 await expect(page.getByLabel('Rename parameter Outside diameter',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Remove Outside diameter',exact:true})).toBeDisabled()
 await page.getByLabel('Variant name',{exact:true}).fill('Small');await page.getByRole('button',{name:'Save current parameters',exact:true}).click()
 const outer=page.locator('.parameter-row').filter({has:page.getByLabel('Rename parameter Outside diameter',{exact:true})});await outer.getByLabel('Value',{exact:true}).fill('40');await outer.getByLabel('Value',{exact:true}).press('Tab')
 await page.getByLabel('Variant name',{exact:true}).fill('Large');await page.getByRole('button',{name:'Save current parameters',exact:true}).click();await page.getByRole('button',{name:'Compare and export variants',exact:true}).click()
 if(!phone(page)){await page.setViewportSize({width:412,height:915});await expect(page.getByRole('dialog',{name:'Compare and export variants',exact:true})).toBeVisible();await page.setViewportSize({width:1440,height:960})}
 await expect(page.getByRole('table')).toContainText('30 mm');await expect(page.getByRole('table')).toContainText('40 mm')
 await page.getByLabel('Include Small',{exact:true}).check();await page.getByLabel('Include Large',{exact:true}).check();await page.getByLabel('Package model format',{exact:true}).selectOption('stl')
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download variants ZIP',exact:true}).click();const download=await pending,files=unzipSync(new Uint8Array(await readFile((await download.path())!)))
 expect(Object.keys(files).filter(n=>n.endsWith('.stl'))).toHaveLength(2);expect(strFromU8(files['01-small/print-report.txt']!)).toContain('Size: 30.00');expect(strFromU8(files['02-large/print-report.txt']!)).toContain('Size: 40.00')
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Model',exact:true}).click();await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('40');expect(errors).toEqual([])
})
test('orthographic inspection and selection sets survive saved-project reopening',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page);await dimensions(page);await page.getByRole('button',{name:'Select Spacer outer',exact:true}).click();await closeDrawer(page)
 await command(page,'Named selection sets');await page.getByLabel('Selection set name',{exact:true}).fill('Spacer assembly');await page.getByRole('button',{name:'Save current selection',exact:true}).click();await expect(page.getByText('2 available · 0 missing · 0 suppressed',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click()
 await command(page,'Toggle orthographic projection');await command(page,'Inspect a cross section');await page.getByRole('button',{name:'Middle of model',exact:true}).click();await closeDrawer(page)
 await command(page,'Saved camera views');await page.getByLabel('View name',{exact:true}).fill('Section detail');await page.getByRole('button',{name:'Save current view',exact:true}).click();await expect(page.getByText(/Orthographic · Section on/)).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click()
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible();await page.reload();await command(page,'Saved camera views');await page.getByRole('button',{name:'Section detail',exact:true}).click();await expect(page.getByRole('button',{name:'Section on · ×',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Display options',exact:true}).click();await expect(page.getByRole('button',{name:'Orthographic projection On',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Display options',exact:true}).click()
 await command(page,'Named selection sets');await page.getByRole('button',{name:'Isolate',exact:true}).click();await expect(page.getByRole('button',{name:'Exit isolation (2)',exact:true})).toBeVisible();await page.getByRole('button',{name:'Exit isolation (2)',exact:true}).click();expect(errors).toEqual([])
})
test('evaluated enclosure exports separate solids with a scope-specific manifest',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page,'enclosure','Electronics enclosure');await command(page,'Export separate parts and manifest')
 await expect(page.getByRole('button',{name:'Download parts ZIP',exact:true})).toBeEnabled();await expect(page.getByRole('table')).toContainText('Part 2')
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download parts ZIP',exact:true}).click();const files=unzipSync(new Uint8Array(await readFile((await (await pending).path())!)))
 expect(Object.keys(files).filter(n=>n.endsWith('.3mf'))).toHaveLength(2);expect(strFromU8(files['parts.csv']!)).toContain('Geometric volume');expect(strFromU8(files['README.txt']!)).toContain('Scope: document')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);expect(errors).toEqual([])
})
