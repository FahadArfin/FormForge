import {test,expect,type Page} from '@playwright/test'
import {createDocument,createNode} from '../packages/model/src/defaults'

const phone=(page:Page)=>page.viewportSize()!.width<981
async function tools(page:Page,open:boolean){if(phone(page))await page.getByRole('button',{name:open?'Build tools':'Close build tools',exact:true}).click()}

for(const tool of ['Move','Scale'] as const)test(`Shift-click selects shapes through ${tool.toLowerCase()} handles and enables Boolean tools`,async({page},info)=>{
 test.setTimeout(120000)
 const doc=createDocument('Shift selection regression'),a=createNode('box'),b=createNode('box')
 for(const [i,node] of [a,b].entries()){node.name=i?'Second shape':'First shape';node.parameters={...node.parameters,width:30,depth:30,height:20};node.transform.position={x:i?10:-10,y:0,z:10}}
 doc.nodes=[a,b]
 await page.goto('/#projects')
 await page.getByLabel('Import a model or project').setInputFiles({name:'shift.forge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue(doc.name)
 const edit=page.getByRole('button',{name:'Edit model',exact:true});if(await edit.isVisible())await edit.click()
 await expect(page.locator('.engine-status')).toContainText('Live preview ready')
 // Use a saved-camera restore to make the overlapping handle/body hit deterministic.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('formforge:restore-camera',{detail:{id:'selection-test',name:'Top',position:{x:0,y:0,z:200},target:{x:0,y:0,z:0},up:{x:0,y:1,z:0},zoom:1,projection:'orthographic',span:200}})))
 await tools(page,true);await page.getByRole('button',{name:tool,exact:true}).click();await tools(page,false)
 const canvas=page.locator('.viewport-canvas canvas'),bounds=(await canvas.boundingBox())!,cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2,unit=bounds.height/200
 await page.mouse.click(cx-10*unit,cy)
 await page.mouse.move(cx+10*unit,cy)
  await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(cx+10*unit+2,cy+2);await page.mouse.up();await page.keyboard.up('Shift')
 await tools(page,true)
 const buttons=page.getByRole('group',{name:'Combine shapes'})
 for(const name of ['Join','Exclude','Intersect'])await expect(buttons.getByRole('button',{name,exact:true})).toBeEnabled()
 await tools(page,false)
 // Shift-clicking empty plate must not throw away the multi-selection.
 await page.keyboard.down('Shift');await page.mouse.click(cx-45*unit,cy+45*unit);await page.keyboard.up('Shift')
 await tools(page,true)
 for(const name of ['Join','Exclude','Intersect']){
  await expect(buttons.getByRole('button',{name,exact:true})).toBeEnabled()
  await buttons.getByRole('button',{name,exact:true}).click()
  await expect(page.getByRole('region',{name:'3D modeling viewport'})).toHaveAttribute('data-joined-previews','1')
  await tools(page,false)
  await page.getByRole('button',{name:'Undo',exact:true}).click()
  await tools(page,true)
 }
 await page.screenshot({path:info.outputPath('shift-selected-boolean-tools.png')})
})
