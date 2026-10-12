import {test,expect,type Page} from '@playwright/test'
import {createDocument,createNode,vec3} from '../packages/model/src/defaults'
import {readFile} from 'node:fs/promises'

type BrushProbe={pressed:boolean;responses:{volume:number;triangles:number;pressed:boolean}[];draws:number[]}
async function probe(page:Page){return page.evaluate(()=>(window as unknown as {volumeProbe:BrushProbe}).volumeProbe)}
async function chooseBrush(page:Page,label:string){
 const phone=page.viewportSize()!.width<981
 if(phone){
  const edit=page.getByRole('button',{name:'Edit model',exact:true})
  if(await edit.isVisible())await edit.click()
  await page.getByRole('button',{name:'Build tools',exact:true}).click()
 }
 await page.getByRole('tab',{name:'Sculpt',exact:true}).click()
 await page.getByRole('button',{name:label,exact:true}).click()
 await page.getByRole('spinbutton',{name:'Brush radius',exact:true}).fill('2')
 if(phone)await page.getByRole('button',{name:'Close build tools',exact:true}).click()
}

test('volume add and carve render while dragging, retain undo/redo, and survive a saved reload',async({page},testInfo)=>{
 test.setTimeout(90_000)
 await page.addInitScript(()=>{
  const state={pressed:false,responses:[] as {volume:number;triangles:number;pressed:boolean}[],draws:[] as number[]}
  ;(window as unknown as {volumeProbe:typeof state}).volumeProbe=state
  document.addEventListener('pointerdown',e=>{if((e.target as HTMLElement)?.tagName==='CANVAS')state.pressed=true},true)
  document.addEventListener('pointerup',()=>{state.pressed=false},true)
  const NativeWorker=window.Worker
  window.Worker=class extends NativeWorker{
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener('message',event=>{const d=event.data;if(d.ok&&d.positions instanceof Float32Array&&typeof d.volume==='number')state.responses.push({volume:d.volume,triangles:d.triangleCount,pressed:state.pressed})})}
  }
  const draw=WebGL2RenderingContext.prototype.drawElements
  WebGL2RenderingContext.prototype.drawElements=function(mode,count,type,offset){if(state.pressed&&mode===this.TRIANGLES)state.draws.push(count);return draw.call(this,mode,count,type,offset)}
 })
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/#projects')
 await expect(page.getByRole('heading',{name:'My projects',exact:true})).toBeVisible()
 const doc=createDocument();doc.name='Live volume brush regression';const plate=createNode('box');plate.parameters={...plate.parameters,width:120,depth:80,height:4};plate.transform.position=vec3(0,0,2);doc.nodes=[plate]
 await page.getByLabel('Import a model or project').setInputFiles({name:'volume-test.forge.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))})
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue(doc.name)
 await expect(page.locator('.engine-status')).toContainText('Live preview ready')
 await page.getByRole('combobox',{name:'Camera view'}).selectOption('top')
 await page.getByRole('button',{name:'Fit all',exact:true}).click()
 const canvas=page.locator('.viewport-canvas canvas');await expect(canvas).toBeVisible()
 const initialMesh=(await probe(page)).responses.at(-1)!
 const volumes=[initialMesh.volume],triangles=[initialMesh.triangles]
 for(const [index,label] of ['Volume add','Volume carve'].entries()){
  await chooseBrush(page,label)
  const box=(await canvas.boundingBox())!,startX=box.x+box.width*.3,y=box.y+box.height*(index===0?.46:.54),distance=box.width*.4
  const beforeProbe=await probe(page),before=beforeProbe.responses.length,drawStart=beforeProbe.draws.length
  await page.mouse.move(startX,y);await page.mouse.down()
  for(let step=1;step<=36;step++){await page.mouse.move(startX+distance*step/36,y);await page.waitForTimeout(20)}
  // Capture before pointer-up: a deferred-until-release rebuild cannot satisfy this.
  const during=await probe(page),updates=during.responses.slice(before).filter(r=>r.pressed),draws=during.draws.slice(drawStart)
  await testInfo.attach(`volume-${index}-progress`,{body:JSON.stringify({updates,renderedTriangleCounts:[...new Set(draws)]}),contentType:'application/json'})
  await page.screenshot({path:testInfo.outputPath(`volume-${index}-while-dragging.png`)})
  await page.mouse.up()
  expect(updates.length,'actual worker geometry should advance several times while input continues').toBeGreaterThanOrEqual(3)
  expect(new Set(updates.map(r=>r.volume)).size).toBeGreaterThanOrEqual(3)
  expect(updates.some(r=>draws.includes(r.triangles*3)),'an updated solid must reach WebGL before release').toBe(true)
  await expect(page.locator('.engine-status')).toContainText('Live preview ready')
  const volume=(await probe(page)).responses.at(-1)!.volume
  if(index===0)expect(volume).toBeGreaterThan(volumes[0]!);else expect(volume).toBeLessThan(volumes[1]!)
  volumes.push(volume);triangles.push((await probe(page)).responses.at(-1)!.triangles)
 }
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.engine-status')).toContainText('Live preview ready')
 await expect(page.locator('.statusbar')).toContainText(`${triangles[1]!.toLocaleString()} triangles`)
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.engine-status')).toContainText('Live preview ready')
 await expect(page.locator('.statusbar')).toContainText(`${triangles[0]!.toLocaleString()} triangles`)
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Redo',exact:true}).click();await expect(page.locator('.engine-status')).toContainText('Live preview ready')}
 await expect(page.getByRole('button',{name:'Saved on this device',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Project actions',exact:true}).click();await page.getByRole('button',{name:/Download an editable backup/}).click()
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download editable backup',exact:true}).click()
 const saved=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(saved.sculptStrokes.some((s:{mode:string})=>s.mode==='add')).toBe(true);expect(saved.sculptStrokes.some((s:{mode:string})=>s.mode==='carve')).toBe(true)
 await page.keyboard.press('Escape');await page.reload();await expect(page.locator('.engine-status')).toContainText('Live preview ready')
 await expect.poll(async()=>Number((await probe(page)).responses.at(-1)!.volume.toFixed(3))).toBe(Number(volumes[2]!.toFixed(3)))
 expect(errors).toEqual([])
})



