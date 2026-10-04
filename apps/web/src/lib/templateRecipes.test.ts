import {describe,expect,it} from 'vitest'
import {parseModelDocument} from '@formforge/model'
import {createStarter} from './starters'
import {applyTemplateDimensions,templateFields,templateValues} from './templateRecipes'
import {templateCatalog} from './templateCatalog'
describe('semantic templates',()=>{
 for(const item of templateCatalog) it(`${item.id} keeps editable linked dimensions through a round trip`,()=>{
  const doc=parseModelDocument(createStarter(item.id)),field=templateFields[item.id][0]!
  expect(doc.template?.version).toBe(1)
  const values=templateValues(doc);const next=applyTemplateDimensions(doc,{...values,[field.key]:values[field.key]!+1})
  expect(next.nodes.map(n=>n.id)).toEqual(doc.nodes.map(n=>n.id))
  expect(parseModelDocument(next).template).toEqual(doc.template)
  expect(next.namedParameters.find(p=>p.name===field.key)?.value).toBe(values[field.key]!+1)
  expect(next.nodes).not.toEqual(doc.nodes)
 })
 it('preserves tray floor and wall while resizing',()=>{
  const doc=createStarter('tray'),next=applyTemplateDimensions(doc,{...templateValues(doc),width:100,wall:3,floor:4})
  expect(next.nodes[1]!.parameters.width).toBe(94)
  expect(next.nodes[1]!.transform.position.z-next.nodes[1]!.parameters.height/2).toBe(4)
 })
 it('rejects bore through the washer rim and leaves the original untouched',()=>{
  const doc=createStarter('washer'),before=JSON.stringify(doc)
  expect(()=>applyTemplateDimensions(doc,{...templateValues(doc),bore:40})).toThrow()
  expect(JSON.stringify(doc)).toBe(before)
 })
 it('refuses to overwrite detached or locked recipe geometry',()=>{
  const doc=createStarter('washer');doc.nodes[0]!.parameterBindings={}
  expect(()=>applyTemplateDimensions(doc,templateValues(doc))).toThrow(/links/)
 })
})

it('retains plate placement when template dimensions change and reopen',async()=>{
 const {evaluate}=await import('../geometry/geometry.worker');const {getPlatePlacementTarget,placeDocumentFromMesh}=await import('./platePlacement');const {resolveDocumentParameterBindings}=await import('./modelParameters')
 const doc=createStarter('enclosure'),mesh=await evaluate(doc),placed=placeDocumentFromMesh(doc,getPlatePlacementTarget(doc,[],'document'),mesh,'center-and-drop')!
 const next=applyTemplateDimensions(parseModelDocument(placed),{...templateValues(placed),height:30})
 expect(next.nodes[0]!.transform.position.x).toBe(placed.nodes[0]!.transform.position.x)
 expect(resolveDocumentParameterBindings(parseModelDocument(next)).document.nodes[0]!.transform.position.x).toBe(next.nodes[0]!.transform.position.x)
})

it('updates unrelated bindings immediately and handles case-only parameter renaming',async()=>{
 const {createNode}=await import('@formforge/model');const {resolveDocumentParameterBindings}=await import('./modelParameters')
 const doc=createStarter('washer'),box=createNode('box');box.parameterBindings={width:'outer'};doc.nodes.push(box)
 doc.namedParameters[0]!.name='Outer'
 const next=applyTemplateDimensions(doc,{...templateValues(doc),outer:36})
 expect(next.nodes.at(-1)!.parameters.width).toBe(36)
 expect(resolveDocumentParameterBindings(parseModelDocument(next)).errors).toEqual({})
 expect(next.namedParameters.filter(p=>p.id==='recipe:outer')).toHaveLength(1)
})

it('preserves user-authored position dependencies when changing semantic dimensions',async()=>{
 const {resolveDocumentParameterBindings}=await import('./modelParameters');const doc=createStarter('washer');doc.nodes[0]!.parameterBindings!.positionX='outer'
 const next=applyTemplateDimensions(resolveDocumentParameterBindings(doc).document,{...templateValues(doc),outer:36})
 expect(next.nodes[0]!.transform.position.x).toBe(36);expect(next.nodes[0]!.parameterBindings!.positionX).toBe('outer')
})
