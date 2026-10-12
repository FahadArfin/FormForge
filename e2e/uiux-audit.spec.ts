import {test,expect} from '@playwright/test'
test('opening a saved project frames the ready canvas before the first interaction',async({page})=>{
 await page.goto('/#studio?starter=washer')
 await page.getByRole('button',{name:'Use this template',exact:true}).first().click()
 await expect(page.locator('.statusbar')).toContainText('triangles')
 await page.getByRole('button',{name:'Open projects',exact:true}).click()
 await expect(page).toHaveURL(/#projects$/)
 await page.reload()
 await expect(page.getByRole('heading',{level:1})).toBeVisible()
 await page.waitForTimeout(500) // Let background project hydration settle before opening the lazy canvas.
 await page.getByRole('button',{name:/PICK UP WHERE YOU LEFT OFF/}).click()
 await expect(page.getByRole('region',{name:'3D modeling viewport'})).toBeVisible()
 const capture=()=>page.evaluate(()=>new Promise<number>(resolve=>window.dispatchEvent(new CustomEvent('formforge:capture-camera',{detail:{receive:(v:{position:{x:number;y:number;z:number};target:{x:number;y:number;z:number}})=>resolve(Math.hypot(v.position.x-v.target.x,v.position.y-v.target.y,v.position.z-v.target.z))}}))))
 await expect.poll(capture).toBeGreaterThan(0)
 const before=await capture()
 await page.getByRole('button',{name:'Fit all',exact:true}).click()
 expect(Math.abs((await capture())-before)/before).toBeLessThan(.02)
})

test('AI entry, phone composer, inspector shortcuts and appearance remain usable',async({page})=>{
 await page.goto('/')
 await page.getByRole('button',{name:'Switch to dark mode'}).click()
 await page.getByRole('link',{name:'Design with AI',exact:true}).first().click()
 await expect(page.getByRole('button',{name:'Engineering',exact:true,includeHidden:true})).toHaveAttribute('aria-pressed','true')
 const phone=(page.viewportSize()?.width??1440)<981
 if(!phone)await page.getByRole('button',{name:'Ask AI',exact:true}).click()
 const composer=page.getByRole('textbox',{name:'Describe your design'})
 await expect(composer).toBeVisible()
 await composer.fill('Design a measured shelf')
 const submit=page.getByRole('button',{name:'Queue design request'})
 await expect(submit).toBeEnabled()
 const box=await submit.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
 await expect(page.getByLabel('ChatGPT handoff')).toContainText('adjacent ChatGPT')
 if(phone){await page.keyboard.press('Escape');await page.getByRole('button',{name:'Inspector',exact:true}).click()}
 await page.getByRole('button',{name:'Printer setup',exact:true}).click()
 await expect(page.getByText(/Print review.*printer setup, evidence and slicer handoff/)).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.dataset.theme)).toBe('dark')
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})


test('workshop help opens the assistant and export warnings lead back to print setup',async({page})=>{
 await page.goto('/#projects')
 const phone=(page.viewportSize()?.width??1440)<981
 if(phone)await page.getByRole('button',{name:'More workshop pages',exact:true}).click()
 await page.getByRole('button',{name:'Getting started',exact:true}).click()
 await page.getByRole('button',{name:'Open AI assistant',exact:true}).click()
 await expect(page.getByRole('textbox',{name:'Describe your design'})).toBeVisible()
 if(phone){await page.getByRole('button',{name:'Close assistant panel'}).click();await page.getByRole('button',{name:'Inspector',exact:true}).click()}
 await page.getByRole('button',{name:'Printer setup',exact:true}).click()
 await page.getByRole('button',{name:'Edit printer setup',exact:true}).click()
 await page.getByLabel('Width X mm',{exact:true}).fill('10')
 await page.getByRole('button',{name:'Apply printer setup',exact:true}).click()
 if(phone)await page.getByRole('button',{name:'Close inspector panel',exact:true}).click()
 await page.getByRole('button',{name:'Export',exact:true}).click()
 const correction=page.getByRole('button',{name:'Review printer and placement',exact:true})
 await expect(correction).toBeVisible()
  await correction.click()
  await expect(page.getByRole('button',{name:'Engineering',exact:true,includeHidden:true})).toHaveAttribute('aria-pressed','false')
  await expect(page.getByRole('button',{name:'Print',exact:true})).toHaveAttribute('aria-pressed','true')
})


test('switching an open phone toolbox to AI rebinds its keyboard focus',async({page})=>{
 test.skip((page.viewportSize()?.width??1440)>980,'Phone drawer lifecycle')
 await page.goto('/#studio')
 await page.getByRole('button',{name:'Edit model',exact:true}).click()
 await page.getByRole('button',{name:'Build tools',exact:true}).click()
 await page.keyboard.press('?')
 await page.getByRole('button',{name:'Open AI assistant',exact:true}).click()
 const drawer=page.getByRole('dialog',{name:'AI engineering assistant'})
 await expect(drawer).toHaveAttribute('aria-modal','true')
 await page.keyboard.press('Tab')
 await expect(page.getByLabel('Assistant connection',{exact:true})).toBeFocused()
 await page.keyboard.press('Escape')
 await expect(drawer).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Ask AI',exact:true})).toBeEnabled()
})
