import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDocument } from '@formforge/model'
import { inspectSourceMesh, inspectDocumentProperties } from './meshInspectionClient'
import { repairMesh } from './meshTools'
import { inspectMeshProperties } from './meshInspection'

const evaluation=vi.hoisted(()=>({run:vi.fn()}))
vi.mock('../geometry/evaluateSnapshot',()=>({evaluateSnapshot:evaluation.run}))
const mesh={positions:[0,0,0,1,0,0,0,1,0,0,0,1],indices:[0,2,1,0,1,3,0,3,2,1,2,3]}
class FakeWorker {
 static instances:FakeWorker[]=[]
 onmessage:((event:MessageEvent)=>void)|null=null
 onerror:((event:ErrorEvent)=>void)|null=null
 onmessageerror:((event:MessageEvent)=>void)|null=null
 terminated=false
 message:unknown
 constructor(){FakeWorker.instances.push(this)}
 postMessage(message:unknown){this.message=message}
 terminate(){this.terminated=true}
 finish(result:unknown){this.onmessage?.({data:{ok:true,result}} as MessageEvent)}
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);FakeWorker.instances=[];evaluation.run.mockReset()})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals()})

describe('bounded mesh inspection jobs',()=>{
 it('returns a cleanup preview without changing the supplied source',async()=>{
  const before=structuredClone(mesh),promise=inspectSourceMesh(mesh)
  FakeWorker.instances[0]!.finish(repairMesh(mesh))
  expect((await promise).after.watertight).toBe(true)
  expect(mesh).toEqual(before)
  expect(FakeWorker.instances[0]!.terminated).toBe(true)
 })
 it('rejects oversized inputs without creating a worker',async()=>{
  await expect(inspectSourceMesh({positions:[0,0,0],indices:new Array(300003).fill(0)})).rejects.toThrow(/100,000/)
  expect(FakeWorker.instances).toHaveLength(0)
 })
 it('does not start an already-cancelled inspection',async()=>{
  await expect(inspectSourceMesh(mesh,AbortSignal.abort())).rejects.toMatchObject({name:'AbortError'})
  expect(FakeWorker.instances).toHaveLength(0)
 })
 it('cancels active jobs and ignores late completion',async()=>{
  const controller=new AbortController(),promise=inspectSourceMesh(mesh,controller.signal)
  const rejected=expect(promise).rejects.toMatchObject({name:'AbortError'})
  controller.abort();FakeWorker.instances[0]!.finish(repairMesh(mesh))
  await rejected
  expect(FakeWorker.instances[0]!.terminated).toBe(true)
 })
 it('terminates work at the 20-second limit',async()=>{
  const rejected=expect(inspectSourceMesh(mesh)).rejects.toThrow(/20.second|timed out/i)
  await vi.advanceTimersByTimeAsync(20000);await rejected
  expect(FakeWorker.instances[0]!.terminated).toBe(true)
 })
 it('cleans up after an unreadable worker response',async()=>{
  const rejected=expect(inspectSourceMesh(mesh)).rejects.toThrow(/unreadable/i)
  FakeWorker.instances[0]!.onmessageerror?.({} as MessageEvent)
  await rejected;expect(FakeWorker.instances[0]!.terminated).toBe(true)
 })
 it('evaluates the complete selected group through the existing export scope',async()=>{
  const document=createDocument(),first=document.nodes[0]!
  const second=structuredClone(first);second.id='second';first.assemblyPath=['assembly'];second.assemblyPath=['assembly'];document.nodes.push(second)
  evaluation.run.mockResolvedValue(mesh)
  const promise=inspectDocumentProperties(document,'selected',[first.id])
  await vi.advanceTimersByTimeAsync(0)
  FakeWorker.instances[0]!.finish(inspectMeshProperties(mesh))
  expect((await promise).volume).toBeCloseTo(1/6)
  expect(evaluation.run.mock.calls[0]![0].nodes).toHaveLength(2)
 })
 it('refuses partial scopes with global sculpting before evaluation',async()=>{
  const document=createDocument(),second=structuredClone(document.nodes[0]!);second.id='second';document.nodes.push(second)
  document.sculptStrokes=[{} as typeof document.sculptStrokes[number]]
  await expect(inspectDocumentProperties(document,'selected',[second.id])).rejects.toThrow(/whole model|complete model/i)
  expect(evaluation.run).not.toHaveBeenCalled()
 })
 it('includes evaluation in the 20-second deadline and aborts it',async()=>{
  let signal:AbortSignal|undefined
  evaluation.run.mockImplementation((_doc,abort)=>{signal=abort;return new Promise(()=>undefined)})
  const rejected=expect(inspectDocumentProperties(createDocument(),'whole',[])).rejects.toThrow(/20.second|timed out/i)
  await vi.advanceTimersByTimeAsync(20000);await rejected
  expect(signal?.aborted).toBe(true)
  expect(FakeWorker.instances).toHaveLength(0)
 })
})
