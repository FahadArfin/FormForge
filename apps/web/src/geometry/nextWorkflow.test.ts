import { expect, it } from 'vitest'
import { createDocument, createNode, vec3, parseModelDocument } from '@formforge/model'
import { evaluate } from './geometry.worker'
import { functionalRecipe } from '../lib/functionalRecipes'
import { insertProject } from '../lib/insertProject'
import { patternAssembly } from '../lib/assemblyTools'
import { createTextNode } from '../lib/textGeometry'
import { analyzeMesh } from '../lib/meshTools'

it.each(['enclosure','bracket','adapter','snapfit'] as const)('builds a closed %s recipe using real Boolean evaluation', async kind => {
  const doc = parseModelDocument({...createDocument(), nodes:functionalRecipe(kind,{width:80,depth:50,height:25,wall:2,clearance:0.2})})
  const mesh = await evaluate(doc)
  expect(mesh.volume).toBeGreaterThan(0)
  expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true)
  expect(analyzeMesh({positions:Array.from(mesh.positions), indices:Array.from(mesh.indices)}).watertight).toBe(true)
  expect(Math.min(...Array.from(mesh.positions).filter((_,i)=>i%3===2))).toBeCloseTo(0,4)
})

it('keeps an inserted cutter inside its project and patterns the complete assembly', async () => {
  const base=createNode('box');base.parameters={...base.parameters,width:20,depth:20,height:20};base.transform.position=vec3(0,0,10)
  const hole=createNode('box','cut');hole.parameters={...hole.parameters,width:10,depth:10,height:22};hole.transform.position=vec3(0,0,10)
  const source={...createDocument(),nodes:[base,hole]}
  const destination={...createDocument(),nodes:[structuredClone(base)]};destination.nodes[0]!.id=crypto.randomUUID()
  const inserted=insertProject(destination,source)
  expect((await evaluate(source)).volume).toBeCloseTo(6000)
  expect((await evaluate(inserted)).volume).toBeCloseTo(8000)
  const patterned=patternAssembly(inserted,[inserted.nodes[1]!.id],{mode:'linear',axis:'x',count:3,spacing:30,degrees:360,origin:vec3()})
  expect(patterned.nodes).toHaveLength(7)
  expect((await evaluate(patterned)).volume).toBeCloseTo(20000)
})

it('subtracts closed text with counters from a real solid', async () => {
  const base=createNode('box');base.parameters={...base.parameters,width:80,depth:40,height:10};base.transform.position=vec3()
  const text=createTextNode({content:'B8O',size:8,depth:12,font:'helvetiker'},'cut');text.transform.position=vec3()
  const solid=await evaluate({...createDocument(),nodes:[base,text]})
  expect(solid.volume).toBeGreaterThan(0)
  expect(solid.volume).toBeLessThan(32000)
  expect(analyzeMesh({positions:Array.from(solid.positions),indices:Array.from(solid.indices)}).watertight).toBe(true)
})
