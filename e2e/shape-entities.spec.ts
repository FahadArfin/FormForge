import {test,expect,type Page} from '@playwright/test'
import {createDocument,createNode} from '../packages/model/src/defaults'
import {readFile} from 'node:fs/promises'
const phone=(page:Page)=>page.viewportSize()!.width<981
async function tools(page:Page,open:boolean){if(phone(page))await page.getByRole('button',{name:open?'Build tools':'Close build tools',exact:true}).click()}
async function backup(page:Page){
 await page.getByRole('button',{name:'Project actions',exact:true}).click()
 await page.getByRole('button',{name:/Download an editable backup/}).click()
 const pending=page.waitForEvent('download')
 await page.getByRole('button',{name:'Download editable backup',exact:true}).click()
 const doc=JSON.parse(await readFile((await (await pending).path())!,'utf8'))
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();return doc
}
test('independent shapes join, move together, separate and retain editable Boolean operations',async({page},info)=>{
 test.setTimeout(120000)
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const a=createNode('box'),b=createNode('box'),doc=createDocument('Independent shapes')
 for(const [i,n] of [a,b].entries()){n.parameters={...n.parameters,width:40,depth:40,height:20};n.transform.position={x:i?8:-8,y:0,z:10};n.name=i?'Second box':'First box'}
 doc.nodes=[a,b]
 await page.goto('/#projects')
 await page.getByLabel('Import a model or project').setInputFiles({name:'entities.forge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue(doc.name)
 const edit=page.getByRole('button',{name:'Edit model',exact:true});if(await edit.isVisible())await edit.click()
 await expect(page.getByRole('button',{name:'Edit shapes',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.getByRole('combobox',{name:'Camera view'}).selectOption('top')
 const canvas=page.locator('.viewport-canvas canvas'),region=page.getByRole('region',{name:'3D modeling viewport'})
 const r=(await canvas.boundingBox())!,x=r.x+r.width/2,y=r.y+r.height/2
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+12,y,{steps:5});await page.mouse.up()
 const moved=await backup(page)
 expect(moved.nodes.filter((n:any,i:number)=>n.transform.position.x!==doc.nodes[i]!.transform.position.x)).toHaveLength(1)
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 await region.focus();await page.keyboard.press('Control+a')
 await tools(page,true)
 await page.getByRole('group',{name:'Combine shapes'}).getByRole('button',{name:'Join',exact:true}).click()
 await expect(region).toHaveAttribute('data-joined-previews','1')
 await page.locator('.shape-boolean-section').screenshot({path:info.outputPath('boolean-tools.png')})
 await tools(page,false)
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+20,y,{steps:6});await page.mouse.up()
 const joined=await backup(page),delta=joined.nodes[0].transform.position.x-a.transform.position.x
 expect(Math.abs(delta)).toBeGreaterThan(0)
 expect(joined.nodes[1].transform.position.x-b.transform.position.x).toBeCloseTo(delta)
 expect(joined.nodes[0].groupId).toBe(joined.nodes[1].groupId)
 await tools(page,true);await page.getByRole('button',{name:'Separate',exact:true}).click();await tools(page,false)
 await region.focus();await page.keyboard.press('Control+a')
 await tools(page,true);await page.getByRole('group',{name:'Combine shapes'}).getByRole('button',{name:'Exclude',exact:true}).click();await tools(page,false)
 await expect(region).toHaveAttribute('data-joined-previews','1')
 const cut=await backup(page);expect(cut.nodes.map((n:any)=>n.boolean)).toEqual(['add','cut'])
 await page.screenshot({path:info.outputPath('excluded-shape.png')})
 await tools(page,true);await page.getByRole('button',{name:'Separate',exact:true}).click();await tools(page,false)
 await region.focus();await page.keyboard.press('Control+a')
 await tools(page,true);await page.getByRole('group',{name:'Combine shapes'}).getByRole('button',{name:'Intersect',exact:true}).click();await tools(page,false)
 await expect(region).toHaveAttribute('data-joined-previews','1')
 const overlap=await backup(page);expect(overlap.nodes.map((n:any)=>n.boolean)).toEqual(['add','intersect'])
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible()
 await page.reload();await expect(region).toHaveAttribute('data-joined-previews','1')
 expect((await backup(page)).nodes).toEqual(overlap.nodes)
 expect(errors).toEqual([])
})
