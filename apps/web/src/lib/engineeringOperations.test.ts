import {describe,it,expect} from 'vitest'
import {createDocument} from '@formforge/model'
import {applyEngineeringOperation,resolveEngineeringDocument} from './engineeringOperations'
const dimensions={width:240,depth:150,deviceWidth:180,deviceDepth:120,deviceHeight:40,thickness:3,earHeight:30,holeDiameter:5,holeSpacing:220,holeHeight:15,cableClearance:15,slotCount:4,slotWidth:5,cornerRadius:1}
describe('editable engineering operations',()=>{
 it('creates and refines a parametric shelf with stable feature ids',async()=>{
 let doc=await applyEngineeringOperation(createDocument(),{type:'rack-shelf',dimensions})
 expect(doc.nodes.some(n=>n.kind==='mesh')).toBe(false)
 const base=doc.nodes.find(n=>n.id==='rack:base')!
 doc=await applyEngineeringOperation(doc,{type:'set-parameter',name:'rack_thickness',expression:'4',unit:'mm'})
 doc=resolveEngineeringDocument(doc)
 expect(doc.nodes.find(n=>n.id===base.id)!.parameters.height).toBe(4)
 doc=await applyEngineeringOperation(doc,{type:'shelf-slots',count:6})
 expect(doc.nodes.filter(n=>n.id.startsWith('rack:slot:'))).toHaveLength(6)
 expect(doc.nodes.find(n=>n.id===base.id)!.parameters.height).toBe(4)
 })
 it('rejects unsafe edits and invalid fits without changing source',async()=>{
 const doc=createDocument(),original=JSON.stringify(doc)
 await expect(applyEngineeringOperation(doc,{type:'rack-shelf',dimensions:{...dimensions,deviceWidth:400}})).rejects.toThrow()
 expect(JSON.stringify(doc)).toBe(original)
 await expect(applyEngineeringOperation(doc,{type:'edit-feature',nodeId:'missing',parameters:{height:4}})).rejects.toThrow()
 })
 it('rejects cyclic parameters',async()=>{
 const doc=createDocument()
 await expect(applyEngineeringOperation(doc,{type:'set-parameter',name:'loop',expression:'loop + 1',unit:'mm'})).rejects.toThrow()
 })
})

it('rejects parameter edits that indirectly move a locked feature',async()=>{
 const doc=createDocument();doc.namedParameters=[{id:'width',name:'Width',expression:'20',unit:'mm',value:20}]
 doc.nodes[0]!.parameterBindings={width:'Width'};doc.nodes[0]!.parameters.width=20;doc.nodes[0]!.locked=true
 await expect(applyEngineeringOperation(doc,{type:'set-parameter',name:'Width',expression:'30',unit:'mm'})).rejects.toThrow(/lock/i)
})
it('rejects negative bound dimensions instead of silently clamping them',async()=>{
 const doc=createDocument(),node=doc.nodes[0]!
 await expect(applyEngineeringOperation(doc,{type:'edit-feature',nodeId:node.id,bindings:{width:'-10'}})).rejects.toThrow(/dimension|binding|positive/i)
})
it('validates shelf clearances after linked parameter changes',async()=>{
 const doc=await applyEngineeringOperation({...createDocument(),nodes:[]},{type:'rack-shelf',dimensions})
 await expect(applyEngineeringOperation(doc,{type:'set-parameter',name:'rack_thickness',expression:'20',unit:'mm'})).rejects.toThrow(/clearance/i)
})
it('changes slot count without resetting an edited shelf or unrelated rack parameters',async()=>{
 let doc=await applyEngineeringOperation({...createDocument(),nodes:[]},{type:'rack-shelf',dimensions})
 doc=await applyEngineeringOperation(doc,{type:'edit-feature',nodeId:'rack:base',rotation:{x:0,y:0,z:90},position:{x:7,y:9,z:3}})
 const base=structuredClone(doc.nodes.find(n=>n.id==='rack:base')!)
 doc=await applyEngineeringOperation(doc,{type:'shelf-slots',count:6})
 expect(doc.nodes.find(n=>n.id==='rack:base')).toEqual(base)
 expect(doc.nodes.filter(n=>n.id.startsWith('rack:slot:'))).toHaveLength(6)
 expect(doc.nodes.find(n=>n.id==='rack:slot:0')!.transform.rotation.z).toBe(90)
})
it('does not accept duplicate source feature IDs or rack parameter collisions',async()=>{
 const doc=createDocument();doc.nodes.push(structuredClone(doc.nodes[0]!))
 expect(()=>resolveEngineeringDocument(doc)).toThrow(/unique|duplicate/i)
 const clean=createDocument();clean.namedParameters=[{id:'mine',name:'rack_width',expression:'12',unit:'mm',value:12}]
 await expect(applyEngineeringOperation(clean,{type:'rack-shelf',dimensions})).rejects.toThrow(/reserved|exists|collision/i)
})
it('cuts real mounting holes and ventilation slots and updates their evaluated geometry',async()=>{
 const {evaluate}=await import('../geometry/geometry.worker')
 const noSlots=await applyEngineeringOperation({...createDocument(),nodes:[]},{type:'rack-shelf',dimensions:{...dimensions,slotCount:0,cornerRadius:0}})
 const full=await evaluate(noSlots),withoutHoles=await evaluate({...noSlots,nodes:noSlots.nodes.filter(n=>!n.id.startsWith('rack:hole:'))})
 expect(withoutHoles.volume-full.volume).toBeGreaterThan(110)
 expect(withoutHoles.volume-full.volume).toBeLessThan(120)
 const slotted=await applyEngineeringOperation(noSlots,{type:'shelf-slots',count:4}),mesh=await evaluate(slotted)
 expect(full.volume-mesh.volume).toBeCloseTo(4*5*90*3,1)
 const thicker=await applyEngineeringOperation(slotted,{type:'set-parameter',name:'rack_thickness',expression:'4',unit:'mm'})
 expect((await evaluate(thicker)).volume).toBeGreaterThan(mesh.volume)
})

it('rejects primitive dimensions that the kernel would silently clamp',async()=>{
 const source={...createDocument(),nodes:[]}
 for(const [kind,parameters] of [
  ['roundedBox',{width:20,depth:20,height:4,fillet:10}],
  ['roundedBox',{width:20,depth:20,height:4,fillet:2}],
  ['roundedBox',{width:20,depth:20,height:4,fillet:0}],
  ['tube',{radius:10,radiusTop:12,height:20}],
  ['spring',{radius:10,radiusTop:.1,height:20}],
  ['gear',{radius:10,radiusTop:10,height:4}],
 ] as const){
  await expect(applyEngineeringOperation(source,{type:'create-feature',id:'bad',name:'Bad',kind,boolean:'add',parameters,position:{x:0,y:0,z:0}})).rejects.toThrow(/round|bore|wire|root|clamp/i)
 }
 const tube=await applyEngineeringOperation(source,{type:'create-feature',id:'tube',name:'Tube',kind:'tube',boolean:'add',parameters:{radius:10,radiusTop:8,height:20},position:{x:0,y:0,z:10}})
 await expect(applyEngineeringOperation(tube,{type:'edit-feature',nodeId:'tube',bindings:{radiusTop:'11'}})).rejects.toThrow(/bore/i)
 // Box primitives carry radius/fillet defaults that are irrelevant to box geometry.
 await expect(applyEngineeringOperation(source,{type:'create-feature',id:'thin',name:'Thin box',kind:'box',boolean:'add',parameters:{width:20,depth:20,height:.2},position:{x:0,y:0,z:.1}})).resolves.toBeDefined()
})

it('rejects fields and bindings that do not affect the requested primitive',async()=>{
 const source={...createDocument(),nodes:[]}
 await expect(applyEngineeringOperation(source,{type:'create-feature',id:'tube',name:'Tube',kind:'tube',boolean:'add',parameters:{radius:10,radiusTop:8,wall:2},position:{x:0,y:0,z:0}})).rejects.toThrow(/wall|unsupported/i)
 const doc=await applyEngineeringOperation(source,{type:'create-feature',id:'tube',name:'Tube',kind:'tube',boolean:'add',parameters:{radius:10,radiusTop:8},position:{x:0,y:0,z:0}})
 await expect(applyEngineeringOperation(doc,{type:'edit-feature',nodeId:'tube',bindings:{width:'40'}})).rejects.toThrow(/width|unsupported/i)
 await expect(applyEngineeringOperation(doc,{type:'edit-feature',nodeId:'tube',parameters:{depth:20}})).rejects.toThrow(/depth|unsupported/i)
})
