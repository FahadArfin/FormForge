import {test,expect,type Page} from '@playwright/test'

async function starter(page:Page){
 await page.goto('/#studio?starter=washer');await page.getByRole('button',{name:'Use this template',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Start with a useful part',exact:true})).toHaveCount(0)
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
}
async function search(page:Page,value:string){await page.getByRole('button',{name:'Find a command',exact:true}).click();await page.getByRole('combobox',{name:'Search commands'}).fill(value)}

test('workshop navigation remains readable across widths and More supports keyboard recovery',async({page})=>{
 await page.goto('/#projects');await expect(page.getByRole('heading',{level:1})).toBeVisible()
 for(const width of [320,390,590,768]){
  await page.setViewportSize({width,height:844})
  const navigation=page.getByRole('navigation',{name:width<=590?'Quick workshop navigation':'Workshop pages',exact:true})
  await expect(navigation).toBeVisible()
  const boxes=await navigation.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,textFits:button.scrollWidth<=button.clientWidth+1}}))
  for(const box of boxes){expect(box.textFits).toBe(true);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.w).toBeLessThanOrEqual(width);expect(box.h).toBeGreaterThanOrEqual(40)}
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=boxes[a]!,y=boxes[b]!;expect(x.x+x.w<=y.x+.5||y.x+y.w<=x.x+.5||x.y+x.h<=y.y+.5||y.y+y.h<=x.y+.5).toBe(true)}
 }
 await page.setViewportSize({width:390,height:844});const more=page.getByRole('button',{name:'More workshop pages',exact:true})
 await more.click();await expect(page.getByRole('dialog',{name:'Workshop menu',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(more).toBeFocused()
 await more.click();await page.getByRole('dialog',{name:'Workshop menu'}).getByRole('button',{name:'Recovery copies',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Automatic recovery copies',exact:true})).toBeVisible();await page.keyboard.press('Escape')
 await page.getByRole('navigation',{name:'Quick workshop navigation'}).getByRole('button',{name:'Template library',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Editable templates',level:1})).toBeVisible();await expect(page.locator('.public-template').getByRole('heading',{level:2})).toHaveCount(8)
})

test('backup → normal export retains print intent, clear file labels and reachable advanced tools',async({page})=>{
 await starter(page);await page.getByRole('button',{name:'Project actions',exact:true}).click()
 await page.getByRole('button',{name:/Download an editable backup/}).click();await expect(page.getByLabel('File format',{exact:true})).toHaveValue('project')
 await expect(page.getByRole('button',{name:'Download editable backup',exact:true})).toBeEnabled();await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'Export',exact:true}).click();await expect(page.getByLabel('File format',{exact:true})).toHaveValue('3mf')
 const download=page.getByRole('button',{name:'Download 3MF',exact:true});await expect(download).toBeEnabled()
 const bounds=await download.boundingBox();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
 await expect(page.getByRole('button',{name:'Export separate parts and manifest',exact:true})).not.toBeVisible()
 await page.getByText('More export options',{exact:true}).click();await expect(page.getByRole('button',{name:'Export separate parts and manifest',exact:true})).toBeVisible()
 await page.getByLabel('File format',{exact:true}).selectOption('stl');await expect(page.getByRole('button',{name:'Download STL',exact:true})).toBeEnabled()
 const file=page.waitForEvent('download');await page.getByRole('button',{name:'Download STL',exact:true}).click();expect((await file).suggestedFilename()).toMatch(/\.stl$/)
 await page.keyboard.press('Escape');await search(page,'Arrange parts on a build plate');await page.getByRole('option').getByRole('button',{name:/Arrange parts on a build plate/}).click()
 await expect(page.getByLabel('Arrange disconnected solids for this export')).toBeChecked();await expect(page.getByLabel('Part spacing (mm)',{exact:true})).toBeVisible()
})

test('common commands, empty search and plain-model phone labels lead to the right controls',async({page})=>{
 await page.goto('/#studio');await page.getByRole('button',{name:'Find a command',exact:true}).click()
 await expect(page.getByRole('listbox',{name:'Commands',exact:true}).getByRole('option')).toHaveCount(8);await expect(page.getByText('Common actions',{exact:true})).toBeVisible()
 const input=page.getByRole('combobox',{name:'Search commands'});await input.fill('nothing-to-find');await expect(page.getByText(/No commands found/)).toBeVisible()
 await input.fill('undo');await expect(page.getByText('Make a change in this project first.',{exact:true})).toBeVisible();await input.press('Enter');await expect(page.getByRole('dialog',{name:'Find a command'})).toBeVisible()
 await input.fill('Add a box');await input.press('Enter');await expect(page.getByRole('dialog',{name:'Find a command'})).toHaveCount(0)
 if((page.viewportSize()?.width??1440)<701){await page.getByRole('group',{name:'Phone review tools'}).getByRole('button',{name:'Model',exact:true}).click();await expect(page.getByRole('button',{name:'Close inspector ×',exact:true})).toBeVisible()}
 await expect(page.getByRole('heading',{name:'Shapes',exact:true})).toBeVisible()
})
