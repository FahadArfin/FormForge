import {test,expect,type Page} from '@playwright/test'
const isPhone=(page:Page)=>(page.viewportSize()?.width??1440)<981
async function openDimensions(page:Page){if(isPhone(page))await page.getByRole('button',{name:'Dimensions',exact:true}).click()}
async function closeDrawer(page:Page){if(isPhone(page))await page.getByRole('button',{name:'Close inspector ×',exact:true}).click()}
async function openTemplate(page:Page){
 await page.getByRole('button',{name:'Use this template',exact:true}).click()
 // Opening saves the previous project asynchronously. Wait before editing the studio,
 // otherwise a fast fill can target the customizer in the departing template dialog.
 await expect(page.getByRole('dialog',{name:'Start with a useful part',exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
}
async function washer(page:Page){await page.goto('/#studio?starter=washer');await openTemplate(page)}
test('template → linked dimensions → undo → saved reopen → 3MF download',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/templates/washer');await expect(page).toHaveTitle(/Washer \/ spacer/)
 await page.getByRole('link',{name:'Customize & preview',exact:true}).click();await openTemplate(page)
 await openDimensions(page);await page.getByLabel('Outer diameter',{exact:true}).fill('36');await page.getByRole('button',{name:'Apply dimensions',exact:true}).click();await closeDrawer(page)
 await page.getByRole('button',{name:'Undo',exact:true}).click();await openDimensions(page);await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('30')
 await page.getByLabel('Outer diameter',{exact:true}).fill('36');await page.getByRole('button',{name:'Apply dimensions',exact:true}).click();await closeDrawer(page)
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible();await page.reload();await openDimensions(page);await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('36');await closeDrawer(page)
 await page.getByRole('button',{name:'Export',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download 3MF',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.3mf$/)
 await expect(page.getByText('Download requested. Check your browser’s downloads.',{exact:true})).toBeVisible();expect(errors).toEqual([])
})
test('invalid dimensions recover and dialogs preserve keyboard access',async({page})=>{
 await washer(page);await openDimensions(page);await page.getByLabel('Bore diameter',{exact:true}).fill('40');await expect(page.getByRole('alert').filter({hasText:'Leave at least'})).toBeVisible();await expect(page.getByRole('button',{name:'Apply dimensions',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Reset draft',exact:true}).click();await expect(page.getByLabel('Bore diameter',{exact:true})).toHaveValue('8');await closeDrawer(page)
 await page.getByRole('button',{name:'Export',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeFocused()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
})
test('all public template previews load and provide unique indexable pages',async({page,request})=>{
 await page.goto('/#templates');const images=page.locator('.public-template img');await expect(images).toHaveCount(8)
 for(const image of await images.all()){await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true)}
 for(const id of ['washer','enclosure','coupon','tray','bracket','adapter','snapfit','cable-guide']){const response=await request.get(`/templates/${id}`);expect(response.status()).toBe(200);const html=await response.text();expect(html).toContain(`rel="canonical" href="https://formforge.fwad101.chatgpt.site/templates/${id}"`);expect(html).toContain('Awaiting a documented physical test')}
})

test('bad mesh import preserves the current project and recovers',async({page})=>{
 await washer(page);await page.locator('input[type=file]').first().setInputFiles({name:'broken.stl',mimeType:'model/stl',buffer:Buffer.from('not a valid STL')})
 await expect(page.locator('.toast')).toContainText(/STL|file|mesh|invalid/i)
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
 await openDimensions(page);await expect(page.getByLabel('Outer diameter',{exact:true})).toHaveValue('30')
})
