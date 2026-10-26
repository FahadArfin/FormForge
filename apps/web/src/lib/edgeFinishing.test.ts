import { expect, it } from 'vitest'
import { createDocument, type EdgeTreatment, type MeshPayload } from '@formforge/model'
import { evaluate } from '../geometry/geometry.worker'
import { applyEdgeFinishing, previewEdgeFinishing } from './edgeFinishing'

const treatment:EdgeTreatment={version:1,axis:'z',sideU:1,sideV:1,mode:'chamfer',amount:2,edges:[{axis:'z',sideU:1,sideV:1},{axis:'z',sideU:-1,sideV:-1}]}
it('previews without mutation and applies the whole edge selection in one editable update',async()=>{
  let document=createDocument();const original=document,node=document.nodes[0]!,calls:string[]=[]
  const preview=await previewEdgeFinishing(()=>document,node.id,treatment,new AbortController().signal,evaluate)
  expect(document).toBe(original);expect(document.nodes[0]!.edgeTreatment).toBeUndefined()
  applyEdgeFinishing(()=>document,preview,(id,edgeTreatment)=>{calls.push(id);document={...document,nodes:document.nodes.map(n=>n.id===id?{...n,edgeTreatment}:n)}})
  expect(calls).toEqual([node.id]);expect(document.nodes[0]!.kind).toBe('box');expect(document.nodes[0]!.edgeTreatment).toEqual(treatment)
  expect(()=>applyEdgeFinishing(()=>document,preview,()=>{throw new Error('should not dispatch')})).toThrow(/changed/i)
})
it('invalidates completion after edits and never applies cancelled or failed geometry',async()=>{
  let document=createDocument();const original=document,node=document.nodes[0]!,controller=new AbortController()
  let complete!:(mesh:MeshPayload)=>void
  const mesh=await evaluate(document)
  const promise=previewEdgeFinishing(()=>document,node.id,treatment,controller.signal,()=>new Promise(resolve=>{complete=resolve}))
  document={...document,nodes:document.nodes.map(n=>({...n,parameters:{...n.parameters,width:100}}))};complete(mesh)
  await expect(promise).rejects.toThrow(/changed/i)
  await expect(previewEdgeFinishing(()=>original,node.id,treatment,controller.signal,async()=>{controller.abort();return mesh})).rejects.toMatchObject({name:'AbortError'})
  await expect(previewEdgeFinishing(()=>original,node.id,treatment,new AbortController().signal,async()=>{throw new Error('Timed out')})).rejects.toThrow('Timed out')
  expect(original.nodes[0]!.edgeTreatment).toBeUndefined()
})
it('rejects locked targets, empty output and open output before apply',async()=>{
  const document=createDocument(),node=document.nodes[0]!,mesh=await evaluate(document)
  node.locked=true
  await expect(previewEdgeFinishing(()=>document,node.id,treatment,new AbortController().signal,evaluate)).rejects.toThrow(/unlock/i)
  node.locked=false
  for(const invalid of [{...mesh,volume:0},{...mesh,indices:mesh.indices.slice(3)}])await expect(previewEdgeFinishing(()=>document,node.id,treatment,new AbortController().signal,async()=>invalid)).rejects.toThrow(/closed/i)
})
