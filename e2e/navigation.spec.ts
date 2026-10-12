import {test,expect,type Page} from '@playwright/test'
const main=(page:Page)=>page.getByRole('navigation',{name:'Main navigation',exact:true})
async function destination(page:Page,name:string){await main(page).getByRole('link',{name,exact:true}).click()}
async function checkNavigation(page:Page,current?:string){
 const nav=main(page)
 await expect(nav).toBeVisible()
 await expect(nav.getByRole('link')).toHaveText(['Community','My projects','Studio'])
 if(current)await expect(nav.getByRole('link',{name:current,exact:true})).toHaveAttribute('aria-current','page')
 else await expect(nav.locator('[aria-current]')).toHaveCount(0)
 const width=page.viewportSize()!.width
 for(const link of await nav.getByRole('link').all()){
  await expect(link).toBeVisible()
  const box=await link.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1)
  expect(await link.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  expect(box!.height).toBeGreaterThanOrEqual(width<=700?40:36)
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
}
test('primary destinations stay labeled and reachable on every surface at narrow widths',async({page})=>{
 await page.goto('/#home')
 for(const width of [320,390,590,768]){
  await page.setViewportSize({width,height:900})
  await page.getByRole('link',{name:'PrintLab home',exact:true}).click();await checkNavigation(page)
  await page.getByRole('link',{name:'Templates',exact:true}).click();await checkNavigation(page)
  await destination(page,'Community');await expect(page.locator('.community-workshop')).toBeVisible();await checkNavigation(page,'Community')
  for(const label of ['Explore','Bookmarks','My shared designs','Recently viewed'])await expect(page.getByRole('navigation',{name:'Community navigation'}).getByRole('button',{name:label,exact:true})).toBeVisible()
  await destination(page,'My projects');await expect(page.getByRole('heading',{name:'My projects',level:1})).toBeVisible();await checkNavigation(page,'My projects')
  await destination(page,'Studio');await expect(page.getByLabel('Project name',{exact:true})).toBeVisible();await checkNavigation(page,'Studio')
 }
})
test('Studio canvas and edit history survive Community, Projects, templates and browser Back/Forward',async({page})=>{
 await page.goto('/#studio?starter=washer');await page.getByRole('button',{name:'Use this template',exact:true}).click()
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
 const canvas=await page.locator('.viewport-canvas canvas').elementHandle()
 expect(canvas).not.toBeNull()
 await page.getByLabel('Project name',{exact:true}).fill('Navigation keeps my work');await page.getByLabel('Project name',{exact:true}).press('Enter')
 await destination(page,'Community');await destination(page,'My projects')
 await page.getByRole('button',{name:/CURRENT PROJECT.*Navigation keeps my work.*Resume in Studio/}).click()
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Navigation keeps my work')
 expect(await canvas!.evaluate(node=>node.isConnected)).toBe(true)
 await page.getByRole('link',{name:'PrintLab home',exact:true}).click()
 await page.getByRole('link',{name:'Templates',exact:true}).click()
 await page.locator('.template-open').first().click();await expect(page.locator('.template-detail')).toBeVisible()
 await page.getByRole('link',{name:'PrintLab home',exact:true}).click();await expect(page.locator('.public-hero')).toBeVisible()
 await destination(page,'Studio');await page.goBack();await expect(page.locator('.public-hero')).toBeVisible();await page.goForward()
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Navigation keeps my work')
 expect(await canvas!.evaluate(node=>node.isConnected)).toBe(true)
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Washer / spacer')
 await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Navigation keeps my work')
})
test('legacy static template URL uses the shared header and can open Home',async({page})=>{
 await page.goto('/templates/washer');await expect(page.getByRole('heading',{name:'Washer / spacer',level:1})).toBeVisible()
 await checkNavigation(page)
 await page.getByRole('link',{name:'PrintLab home',exact:true}).click();await expect(page.locator('.public-hero')).toBeVisible()
 await destination(page,'Community');await checkNavigation(page,'Community')
})
