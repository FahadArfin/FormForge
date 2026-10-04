import {expect,it} from 'vitest'
import {createDocument,createNode,parseModelDocument,vec3} from '@formforge/model'
import {createAttachedHole,resolveAttachedHoles} from './attachedHoles'
import {evaluate} from '../geometry/geometry.worker'
for(const face of ['x+','x-','y+','y-','z+','z-'] as const)it(`cuts only its target through face ${face}`,async()=>{
 const box=createNode('box');box.parameters={...box.parameters,width:20,depth:20,height:20}
 const hole=createAttachedHole(box,face,4,2,1,'through',5)
 let doc={...createDocument(),nodes:[box,hole]};const mesh=await evaluate(doc)
 expect(mesh.volume).toBeCloseTo(8000-Math.PI*4*20,0)
 box.parameters.height=30;box.transform.rotation=vec3(20,30,40)
 doc=parseModelDocument(doc);const resolved=resolveAttachedHoles(doc);expect(Object.keys(resolved.errors)).toHaveLength(0)
 expect(resolved.document.nodes[1]!.faceAttachment?.offsetU).toBe(2)
})
it('never subtracts its hole from an overlapping unrelated solid',async()=>{
 const box=createNode('box');const hole=createAttachedHole(box,'z+',4,0,0,'through',5),other={...structuredClone(box),id:'other'}
 const withHole=await evaluate({...createDocument(),nodes:[box,hole,other]}),solid=await evaluate({...createDocument(),nodes:[box]})
 expect(withHole.volume).toBeCloseTo(solid.volume,4)
})
it('keeps missing and shrunken target references repairable and blocks misleading export',async()=>{
 const box=createNode('box'),hole=createAttachedHole(box,'z+',4,0,0,'blind',3)
 const doc={...createDocument(),nodes:[hole]}
 expect(resolveAttachedHoles(doc).errors[hole.id]).toMatch(/target/i)
 await expect(evaluate(doc)).rejects.toThrow(/target/i)
 box.parameters.width=2;expect(resolveAttachedHoles({...doc,nodes:[box,hole]}).errors[hole.id]).toMatch(/face/i)
})
it('applies bounded edge treatments with analytic volumes',async()=>{
 const box=createNode('box');box.parameters={...box.parameters,width:20,depth:20,height:20}
 box.edgeTreatment={version:1,mode:'chamfer',axis:'z',sideU:1,sideV:1,amount:2}
 expect((await evaluate({...createDocument(),nodes:[box]})).volume).toBeCloseTo(7960,4)
 box.edgeTreatment.mode='fillet';expect((await evaluate({...createDocument(),nodes:[box]})).volume).toBeCloseTo(8000-(4-Math.PI)*20,0)
 box.edgeTreatment.amount=20;await expect(evaluate({...createDocument(),nodes:[box]})).rejects.toThrow()
})

it('keeps blind-hole depth exact instead of extending into the remaining floor',async()=>{
 const box=createNode('box');box.parameters={...box.parameters,width:20,depth:20,height:20};const hole=createAttachedHole(box,'z+',4,0,0,'blind',3)
 expect((await evaluate({...createDocument(),nodes:[box,hole]})).volume).toBeCloseTo(8000-Math.PI*4*3,0)
})

it('rejects feature values outside persisted schema bounds before creating geometry',async()=>{
 const box=createNode('box')
 for(const depth of [-1,0,10001])expect(()=>createAttachedHole(box,'z+',4,0,0,'through',depth)).toThrow()
 box.edgeTreatment={version:1,mode:'chamfer',axis:'z',sideU:1,sideV:1,amount:.001}
 await expect(evaluate({...createDocument(),nodes:[box]})).rejects.toThrow()
})
it('never resolves an orphan imported hole against a destination node with the same ID',async()=>{
 const {insertProject}=await import('./insertProject');const box=createNode('box');box.id='shared-host'
 const hole=createAttachedHole(box,'z+',4,0,0,'through',5)
 expect(()=>insertProject({...createDocument(),nodes:[box]},{...createDocument(),nodes:[hole]})).toThrow(/target|attachment/i)
})
it('places new attached features in the target assembly scope',()=>{
 const box=createNode('box');box.assemblyPath=['new-assembly'];box.combined=true;box.groupId='new-group'
 const hole=createAttachedHole(box,'z+',4,0,0,'through',5)
 expect(hole.assemblyPath).toEqual(box.assemblyPath);expect(hole.groupId).toBe(box.groupId)
})
