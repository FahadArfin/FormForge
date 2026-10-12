import {test,expect,type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'
const phone=(page:Page)=>(page.viewportSize()?.width??1440)<981
async function starter(page:Page){
 await page.goto('/#studio?starter=washer')
 await page.getByRole('button',{name:'Use this template',exact:true}).click()
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
 await expect(page.locator('.statusbar')).toContainText('triangles')
}
async function command(page:Page,name:string){
 await page.getByRole('button',{name:'Find a command',exact:true}).click()
 await page.getByRole('combobox',{name:'Search commands'}).fill(name)
 await page.getByRole('option').getByRole('button',{name:new RegExp(name)}).click()
}
async function downloadText(page:Page,label:string){
 const pending=page.waitForEvent('download')
 await page.getByRole('button',{name:label,exact:true}).click()
 const downloaded=await pending
 return {name:downloaded.suggestedFilename(),text:await readFile((await downloaded.path())!,'utf8')}
}

test('new mesh formats export and return through explicit import unit review',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await starter(page)
 await page.getByRole('button',{name:'Export',exact:true}).click()
 for(const format of ['ply','off']){
   await page.getByLabel('File format',{exact:true}).selectOption(format)
   await expect(page.getByRole('button',{name:`Download ${format.toUpperCase()}`,exact:true})).toBeEnabled()
   const file=await downloadText(page,`Download ${format.toUpperCase()}`)
   expect(file.name).toMatch(new RegExp(`\\.${format}$`))
   expect(file.text.startsWith(format==='ply'?'ply':'OFF')).toBe(true)
   await page.getByRole('button',{name:'Close dialog',exact:true}).click()
   await page.locator('input[type=file]').first().setInputFiles({name:file.name,mimeType:'text/plain',buffer:Buffer.from(file.text)})
   await expect(page.getByLabel('Source units',{exact:true})).toBeEnabled()
   await expect(page.getByText(/no standard unit metadata/)).toBeVisible()
   await expect(page.locator('.review-dimensions')).toContainText('30.00')
   // Cancel the PLY import to preserve the original; add the OFF through real import.
   await page.getByRole('button',{name:format==='ply'?'Cancel':'Add reviewed model',exact:true}).click()
   if(format==='ply')await page.getByRole('button',{name:'Export',exact:true}).click()
 }
 await expect(page.getByRole('dialog')).toHaveCount(0)
 await expect(page.locator('.statusbar')).toContainText('triangles')
 expect(errors).toEqual([])
})

test('section drawing previews evaluated geometry and exports millimeter SVG and DXF',async({page})=>{
 await starter(page);await command(page,'Export section drawing SVG or DXF')
 await page.getByRole('button',{name:'Middle of model',exact:true}).click()
 await page.getByRole('button',{name:'Preview section drawing',exact:true}).click()
 await page.getByRole('button',{name:'Generate preview',exact:true}).click()
 await expect(page.getByRole('img',{name:'Section linework preview'})).toBeVisible()
 const svg=await downloadText(page,'Download SVG'),dxf=await downloadText(page,'Download DXF')
 expect(svg.text).toContain('<svg');expect(svg.text).toMatch(/width="[^"]+mm"/)
 expect(dxf.text).toContain('$INSUNITS');expect(dxf.text).toContain('LINE')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Section drawing',exact:true})).toHaveCount(0)
})

test('assembly inventory exports components and source relationships without changing the model',async({page})=>{
 await starter(page);await command(page,'Assembly parts list and inventory')
 const region=page.getByRole('region',{name:'Assembly inventory'})
 await expect(region).toBeVisible();await expect(region).toContainText('1 component')
 const report=JSON.parse((await downloadText(page,'Download inventory JSON')).text)
 expect(report.components).toHaveLength(1);expect(report.components[0].quantity).toBe(1)
 expect(report.components[0].cutFeatures).toBe(1);expect(report.components[0].nodeIds).toHaveLength(2)
 const csv=await downloadText(page,'Download inventory CSV');expect(csv.text).toContain('Quantity (source component)')
 await page.getByRole('button',{name:'Select component',exact:true}).click()
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})

test('portable presets require review, add without reshaping, and survive undo and reload',async({page})=>{
 await starter(page);await command(page,'Import or export parameter presets')
 await expect(page.getByRole('button',{name:'Import or export presets',exact:true})).toBeFocused()
 await page.getByLabel('Variant name',{exact:true}).fill('Original')
 await page.getByRole('button',{name:'Save current parameters',exact:true}).click()
 await page.getByRole('button',{name:'Import or export presets',exact:true}).click()
 const file=JSON.parse((await downloadText(page,'Download saved presets')).text)
 file.variants[0].name='Imported large'
 const outer=file.variants[0].parameters.find((p:{name:string})=>p.name==='outer')
 expect(outer).toBeDefined();outer.value=40;outer.expression=''
 await page.getByLabel('Import preset JSON',{exact:true}).setInputFiles({name:'sizes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))})
 await expect(page.getByRole('region',{name:'Preset import preview'})).toContainText('Imported large')
 await page.getByRole('button',{name:'Add presets',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Parameter preset exchange',exact:true}).getByRole('status')).toContainText('Added 1 preset')
 await page.getByRole('button',{name:'Close dialog',exact:true}).click()
 await page.getByRole('button',{name:'Model',exact:true}).click()
 await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('30')
 await page.getByRole('button',{name:'Parameters',exact:true}).click()
 const variant=page.locator('.parameter-variant-row').filter({hasText:'Imported large'})
 await variant.getByRole('button',{name:'Apply',exact:true}).click()
 await page.getByRole('button',{name:'Model',exact:true}).click()
 await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('40')
 if(phone(page))await page.getByRole('button',{name:'Close inspector ×',exact:true}).click()
 await command(page,'Undo')
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible()
 await page.reload();await command(page,'Import or export parameter presets')
 await expect(page.locator('.parameter-variant-row').filter({hasText:'Imported large'})).toBeVisible()
 await page.getByRole('button',{name:'Model',exact:true}).click()
 await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('30')
})
