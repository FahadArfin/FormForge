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
async function pick(page:Page,names:string[]){
 if(phone(page)){
  const edit=page.getByRole('button',{name:'Edit model',exact:true});if(await edit.isVisible())await edit.click()
  await page.getByRole('button',{name:'Inspector',exact:true}).click()
 }
 for(const [i,name] of names.entries())await page.getByRole('button',{name:`Select ${name}`,exact:true}).click({modifiers:i?['Shift']:[]})
 if(phone(page))await page.getByRole('button',{name:'Close inspector ×',exact:true}).click()
}
async function combine(page:Page,name:string){
 await tools(page,true)
 const button=page.getByRole('group',{name:'Combine shapes'}).getByRole('button',{name,exact:true})
 await expect(button).toBeEnabled();await button.click();await tools(page,false)
 await expect(page.getByRole('region',{name:'3D modeling viewport'})).toHaveAttribute('data-joined-previews','1')
}
test('keeps previous cuts through repeated nested operations, undo, separate and reload',async({page},info)=>{
 test.setTimeout(150000)
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 const doc=createDocument('Nested combinations'),names=['Cut body','Original hole','Added block','New cutter','Overlap mask']
 const nodes=names.map((name,i)=>{const n=createNode('box',i===1?'cut':'add');n.name=name;n.parameters={...n.parameters,width:i===1?4:i===4?100:10,depth:i===1?4:i===4?100:10,height:i===1?4:i===4?100:10};n.transform.position={x:i===2?20:i===3?-4:0,y:0,z:10};if(i<2){n.combined=true;n.groupId='initial-cut'}return n})
 nodes[3]!.parameters.width=2;nodes[3]!.parameters.depth=nodes[3]!.parameters.height=20;doc.nodes=nodes
 await page.goto('/#projects')
 await page.getByLabel('Import a model or project').setInputFiles({name:'nested.forge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue(doc.name)
 const edit=page.getByRole('button',{name:'Edit model',exact:true});if(await edit.isVisible())await edit.click()
 await pick(page,['Cut body','Added block']);await combine(page,'Join')
 let saved=await backup(page)
 expect(saved.nodes.slice(0,3).every((n:any)=>n.booleanPath.length===1)).toBe(true)
 expect(saved.nodes[1].boolean).toBe('cut')
 await pick(page,['Cut body','New cutter']);await combine(page,'Exclude')
 saved=await backup(page);expect(saved.nodes[0].booleanPath).toHaveLength(2);expect(saved.nodes[3].booleanPath[0].mode).toBe('cut')
 await pick(page,['Cut body','Overlap mask']);await combine(page,'Intersect')
 saved=await backup(page);expect(saved.nodes[0].booleanPath).toHaveLength(3);expect(saved.nodes[4].booleanPath[0].mode).toBe('intersect')
 await page.getByRole('button',{name:'Undo',exact:true}).click()
 expect((await backup(page)).nodes[0].booleanPath).toHaveLength(2)
 await page.getByRole('button',{name:'Redo',exact:true}).click()
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible()
 await page.reload();await expect(page.getByRole('region',{name:'3D modeling viewport'})).toHaveAttribute('data-joined-previews','1')
 expect((await backup(page)).nodes).toEqual(saved.nodes)
 await pick(page,['Added block']);await tools(page,true);await page.getByRole('button',{name:'Separate',exact:true}).click();await tools(page,false)
 const peeled=await backup(page)
 expect(peeled.nodes[0].booleanPath).toHaveLength(2);expect(peeled.nodes[1].boolean).toBe('cut');expect(peeled.nodes[4].booleanPath).toBeUndefined()
 await page.screenshot({path:info.outputPath('nested-cuts-preserved.png')})
 expect(errors).toEqual([])
})
