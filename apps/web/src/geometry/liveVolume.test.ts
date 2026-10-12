import {expect,it} from 'vitest'
import {createDocument,createNode,vec3} from '@formforge/model'
import * as worker from './geometry.worker'
it('reuses only exact ordered solid prefixes with real WASM',async()=>{
 const doc={...createDocument(),nodes:[createNode('box','add',vec3())]}
 const evaluator=new worker.VolumeEvaluator()
 try{
  for(let i=0;i<8;i++){
   doc.sculptStrokes.push({id:String(i),nodeId:doc.nodes[0]!.id,mode:i%2?'carve':'add',center:vec3(i,0,10),radius:3,strength:0.5,createdAt:''})
   const incremental=await evaluator.evaluate(structuredClone(doc)),full=await worker.evaluate(doc)
   expect(incremental.volume).toBeCloseTo(full.volume,8)
   expect(incremental.triangleCount).toBe(full.triangleCount)
   expect(evaluator.lastEvaluation.appliedStamps).toBe(1)
  }
  doc.sculptStrokes[0]!.radius=4
  await evaluator.evaluate(doc)
  expect(evaluator.lastEvaluation.reused).toBe(false)
  expect(evaluator.lastEvaluation.appliedStamps).toBe(8)
 }finally{evaluator.dispose()}
})
it('invalidates edited positions, base nodes, shortened prefixes and projects; preserves legacy deforms',async()=>{
 const original={...createDocument(),nodes:[createNode('box','add',vec3())]}
 original.sculptStrokes=[{id:'same',nodeId:original.nodes[0]!.id,mode:'add',center:vec3(0,0,10),radius:3,strength:0.5,createdAt:''},{id:'legacy',nodeId:original.nodes[0]!.id,mode:'smooth',center:vec3(0,0,10),radius:6,strength:0.5,createdAt:''}]
 const evaluator=new worker.VolumeEvaluator()
 try{
  for(const mutation of [(d:typeof original)=>{d.sculptStrokes[0]!.center.x=2},(d:typeof original)=>{d.nodes[0]!.parameters.width=31},(d:typeof original)=>{d.sculptStrokes.pop()},(d:typeof original)=>{d.id='different'}]){
   await evaluator.evaluate(original)
   const changed=structuredClone(original);mutation(changed)
   const mesh=await evaluator.evaluate(changed),full=await worker.evaluate(changed)
   expect(evaluator.lastEvaluation.reused).toBe(false)
   expect(mesh.positions).toEqual(full.positions);expect(mesh.indices).toEqual(full.indices);expect(mesh.volume).toBeCloseTo(full.volume,8)
  }
  await evaluator.evaluate(original)
  expect((await evaluator.evaluate({...original,nodes:[]})).positions).toHaveLength(0)
  expect(evaluator.solid).toBeNull()
  await evaluator.evaluate(original)
  const invalid=structuredClone(original);invalid.nodes[0]!.edgeTreatment={kind:'fillet',radius:-1} as never
  await expect(evaluator.evaluate(invalid)).rejects.toThrow()
  expect(evaluator.solid).toBeNull()
  await evaluator.evaluate(original);expect(evaluator.lastEvaluation.reused).toBe(false)
 }finally{evaluator.dispose()}
})
it('disposal during initialization does not retain or deliver cancelled work',async()=>{
 const evaluator=new worker.VolumeEvaluator(),doc={...createDocument(),nodes:[createNode('box','add',vec3())]}
 const pending=evaluator.evaluate(doc)
 evaluator.dispose()
 await expect(pending).rejects.toMatchObject({name:'AbortError'})
 const result=await evaluator.evaluate(doc)
 expect(result.volume).toBeGreaterThan(0)
 expect(evaluator.lastEvaluation.reused).toBe(false)
 evaluator.dispose()
})
