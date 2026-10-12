import {it,expect,vi} from 'vitest'
import {createDocument,type DesignPlan,type MeshPayload} from '@formforge/model'
import {EngineeringSession} from './engineeringSession'
const plan:DesignPlan={version:1,title:'Plate',requirements:[],questions:[],assumptions:[],expectedChecks:[],operations:[{type:'create-feature',id:'plate',name:'Plate',kind:'box',boolean:'add',position:{x:0,y:0,z:2},parameters:{width:40,depth:30,height:4}}]}
const mesh:MeshPayload={positions:new Float32Array([0,0,0,1,0,0,0,1,1]),indices:new Uint32Array([0,1,2]),triangleCount:1,volume:1}
it('previews without mutation and applies exactly once',async()=>{
 let doc=createDocument();const original=doc,apply=vi.fn(d=>{doc=d})
 const s=new EngineeringSession(()=>doc,apply,async()=>mesh,async()=>{})
 s.submit(plan);await s.preview();expect(doc).toBe(original);expect(s.state.status).toBe('ready')
 await s.apply();expect(apply).toHaveBeenCalledTimes(1);expect(doc.nodes).toHaveLength(original.nodes.length+1)
 await expect(s.apply()).rejects.toThrow();expect(doc.engineering?.history).toHaveLength(1)
})
it('rejects previews made stale by document changes',async()=>{
 let doc=createDocument();const apply=vi.fn(),s=new EngineeringSession(()=>doc,apply,async()=>mesh,async()=>{})
 s.submit(plan);await s.preview();doc={...doc,name:'Changed'}
 await expect(s.apply()).rejects.toThrow(/changed/);expect(apply).not.toHaveBeenCalled()
})
it('discard prevents late geometry from reviving a proposal',async()=>{
 let done!:(m:MeshPayload)=>void
 const doc=createDocument(),s=new EngineeringSession(()=>doc,vi.fn(),()=>new Promise(r=>{done=r}),async()=>{})
 s.submit(plan);const pending=s.preview();await new Promise(r=>setTimeout(r,0));s.discard();done(mesh);await pending;expect(s.state.status).toBe('idle')
})
it('questions block generation and failed geometry leaves source intact',async()=>{
 const doc=createDocument(),apply=vi.fn(),s=new EngineeringSession(()=>doc,apply,async()=>{throw Error('Invalid mesh')},async()=>{})
 s.submit({...plan,questions:['Hole spacing?']});await expect(s.preview()).rejects.toThrow(/measurements/)
 s.submit(plan);await s.preview();expect(s.state.status).toBe('error');expect(apply).not.toHaveBeenCalled()
})

it('rejects geometry with invalid indices even if volume and triangle count claim success',async()=>{
 const doc=createDocument(),apply=vi.fn(),s=new EngineeringSession(()=>doc,apply,async()=>({...mesh,indices:new Uint32Array([0,1,999])}),async()=>{})
 s.submit(plan);await s.preview();expect(s.state.status).toBe('error');expect(apply).not.toHaveBeenCalled()
})
it('rejects changes to a validated draft before Apply',async()=>{
 // The session remains reviewable, but applying an externally mutated preview must be rejected.
 let doc=createDocument();const commit=vi.fn(d=>{doc=d}),s=new EngineeringSession(()=>doc,commit,async()=>mesh,async()=>{})
 s.submit(plan);await s.preview();s.state.draft!.nodes[0]!.parameters.width=999
 await expect(s.apply()).rejects.toThrow(/changed|preview/i);expect(commit).not.toHaveBeenCalled()
})
