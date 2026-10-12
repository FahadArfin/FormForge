import {describe,expect,it,vi} from 'vitest'
import {createDocument,type DesignPlan,type ModelDocument} from '@formforge/model'
import {applyEngineeringOperation} from './engineeringOperations'
import {EngineeringSession} from './engineeringSession'
import {evaluate} from '../geometry/geometry.worker'
import {splitMeshAtPlane} from '../geometry/split.worker'
// Replace only browser Worker transport. Every geometry evaluation and plane split uses actual WASM.
vi.mock('../geometry/evaluateSnapshot',()=>({evaluateSnapshot:(doc:ModelDocument)=>evaluate(doc)}))
vi.mock('./planeSplit',async original=>{
 const actual=await original<typeof import('./planeSplit')>()
 return {...actual,splitDocumentSafely:(get:()=>ModelDocument,options:import('./planeSplit').SplitOptions,apply:(doc:ModelDocument)=>void,context:object)=>actual.splitDocumentSafely(get,options,apply,{...context,compute:async(doc,plane)=>splitMeshAtPlane(await evaluate(doc),plane)})}
})
const dimensions={width:240,depth:150,deviceWidth:180,deviceDepth:120,deviceHeight:40,thickness:3,earHeight:30,holeDiameter:5,holeSpacing:220,holeHeight:15,cableClearance:15,slotCount:4,slotWidth:5,cornerRadius:1}
const splitPlan:DesignPlan={version:1,title:'Split into halves',requirements:[],questions:[],assumptions:[],expectedChecks:[],operations:[{type:'split',axis:'x',offset:0,keep:'both'}]}
describe('real engineering geometry acceptance',()=>{
 it('refines a shelf through thickness, slots, inward holes, rounding and a two-part split',async()=>{
  let doc=await applyEngineeringOperation({...createDocument(),nodes:[]},{type:'rack-shelf',dimensions})
  const initialIds=doc.nodes.filter(n=>!n.id.startsWith('rack:slot:')).map(n=>n.id),volumes:number[]=[]
  const capture=async()=>{const mesh=await evaluate(doc);expect(mesh.triangleCount).toBeGreaterThan(0);expect(Number.isFinite(mesh.volume)&&mesh.volume>0).toBe(true);volumes.push(mesh.volume)}
  await capture()
  doc=await applyEngineeringOperation(doc,{type:'set-parameter',name:'rack_thickness',expression:'4',unit:'mm'});await capture()
  expect(doc.nodes.find(n=>n.id==='rack:base')!.parameters.height).toBe(4)
  doc=await applyEngineeringOperation(doc,{type:'shelf-slots',count:6});await capture()
  expect(doc.nodes.filter(n=>n.id.startsWith('rack:slot:'))).toHaveLength(6)
  doc=await applyEngineeringOperation(doc,{type:'set-parameter',name:'rack_holeSpacing',expression:'210',unit:'mm'});await capture()
  expect(doc.nodes.find(n=>n.id==='rack:hole:-1')!.transform.position.x).toBe(-105)
  expect(doc.nodes.find(n=>n.id==='rack:hole:1')!.transform.position.x).toBe(105)
  doc=await applyEngineeringOperation(doc,{type:'round',nodeId:'rack:base',radius:1.5});await capture()
  expect(doc.nodes.find(n=>n.id==='rack:base')!.parameters.fillet).toBe(1.5)
  expect(doc.nodes.filter(n=>!n.id.startsWith('rack:slot:')).map(n=>n.id)).toEqual(initialIds)
  expect(volumes[1]).toBeGreaterThan(volumes[0]!);expect(volumes[2]).toBeLessThan(volumes[1]!)
  const beforeSplit=doc,checkpoint=vi.fn(async()=>undefined),commit=vi.fn((next:ModelDocument)=>{doc=next})
  const session=new EngineeringSession(()=>doc,commit,evaluate,checkpoint);session.submit(splitPlan);await session.preview()
  expect(session.state.error).toBeUndefined();expect(session.state.status).toBe('ready');expect(doc).toBe(beforeSplit);expect(checkpoint).not.toHaveBeenCalled()
  expect(session.state.draft!.nodes).toHaveLength(2);expect(session.state.draft!.nodes.every(n=>n.kind==='mesh')).toBe(true)
  for(const node of session.state.draft!.nodes)expect((await evaluate({...session.state.draft!,nodes:[node]})).volume).toBeGreaterThan(0)
  expect(session.state.mesh!.volume).toBeCloseTo(volumes.at(-1)!,1)
  await session.apply();expect(checkpoint).toHaveBeenCalledWith(beforeSplit);expect(commit).toHaveBeenCalledTimes(1)
  expect(doc.engineering?.shelf).toBeUndefined()
 })
 it('does not apply a split after a failed recovery checkpoint',async()=>{
  let doc=createDocument();const original=doc,commit=vi.fn((next:ModelDocument)=>{doc=next})
  const session=new EngineeringSession(()=>doc,commit,evaluate,async()=>{throw new Error('Storage unavailable')})
  session.submit(splitPlan);await session.preview();expect(session.state.status).toBe('ready')
  await expect(session.apply()).rejects.toThrow(/Storage/);expect(commit).not.toHaveBeenCalled();expect(doc).toBe(original)
 })
 it('does not apply a split cancelled while the recovery checkpoint is pending',async()=>{
  let release!:()=>void;const doc=createDocument(),commit=vi.fn()
  const session=new EngineeringSession(()=>doc,commit,evaluate,()=>new Promise<void>(resolve=>{release=resolve}))
  session.submit(splitPlan);await session.preview();expect(session.state.status).toBe('ready')
  const pending=session.apply();session.discard();release()
  await expect(pending).rejects.toThrow(/changed/);expect(commit).not.toHaveBeenCalled();expect(session.state.status).toBe('idle')
 })
})

it('allows parameter definitions before the first solid while requiring a solid final preview',async()=>{
 let doc:ModelDocument={...createDocument(),nodes:[]};const session=new EngineeringSession(()=>doc,next=>{doc=next},evaluate,async()=>undefined)
 session.submit({version:1,title:'Parametric plate',requirements:[],questions:[],assumptions:[],expectedChecks:[],operations:[{type:'set-parameter',name:'Width',expression:'40',unit:'mm'},{type:'create-feature',id:'plate',name:'Plate',kind:'box',boolean:'add',position:{x:0,y:0,z:2},parameters:{depth:30,height:4},bindings:{width:'Width'}}]})
 await session.preview();expect(session.state.error).toBeUndefined();expect(session.state.status).toBe('ready');expect(session.state.mesh!.volume).toBeCloseTo(4800)
 const onlyParameters=new EngineeringSession(()=>doc,vi.fn(),evaluate,async()=>undefined)
 onlyParameters.submit({version:1,title:'Parameters only',requirements:[],questions:[],assumptions:[],expectedChecks:[],operations:[{type:'set-parameter',name:'Width',expression:'40',unit:'mm'}]})
 await onlyParameters.preview();expect(onlyParameters.state.status).toBe('error')
})
