import {designPlanSchema,parseModelDocument,type DesignPlan,type ModelDocument,type MeshPayload} from '@formforge/model'
import {applyEngineeringOperation} from './engineeringOperations'
export type ProposalState={status:'idle'|'planned'|'evaluating'|'ready'|'applied'|'error';plan?:DesignPlan;source?:ModelDocument;draft?:ModelDocument;mesh?:MeshPayload;step:number;error?:string}
export class EngineeringSession{
 state:ProposalState={status:'idle',step:0}
 private controller?:AbortController
 private generation=0
 private sourceFingerprint=""
 private readyFingerprint=""
 private listeners=new Set<()=>void>()
 constructor(private getDocument:()=>ModelDocument,private commit:(doc:ModelDocument)=>void,private evaluate:(doc:ModelDocument,signal?:AbortSignal)=>Promise<MeshPayload>,private checkpoint:(doc:ModelDocument)=>Promise<unknown>){}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 snapshot=()=>this.state
 private sourceIsCurrent(source:ModelDocument){return this.getDocument()===source&&JSON.stringify(source)===this.sourceFingerprint}
 private update(next:ProposalState){this.state=next;this.listeners.forEach(f=>f())}
 submit(input:unknown){const plan=designPlanSchema.parse(input);this.controller?.abort();this.generation++;this.sourceFingerprint=JSON.stringify(this.getDocument());this.readyFingerprint='';this.update({status:'planned',plan,source:this.getDocument(),step:0});return plan}
 discard(){this.controller?.abort();this.generation++;this.update({status:'idle',step:0})}
 async preview(){
  const {plan,source}=this.state;if(!plan||!source)throw new Error('Submit a design plan first.')
  if(plan.questions.length)throw new Error('Resolve missing measurements and submit an updated plan before preview.')
  if(!plan.operations.length)throw new Error('This plan has no CAD operations.')
  if(!this.sourceIsCurrent(source))throw new Error('The design changed. Submit a refreshed proposal.')
  this.controller?.abort();const controller=new AbortController(),generation=++this.generation;this.controller=controller
  this.update({status:'evaluating',plan,source,step:0})
  let draft=source,mesh:MeshPayload|undefined
  try{
   for(const [index,op] of plan.operations.entries()){
    if(controller.signal.aborted||!this.sourceIsCurrent(source))throw new Error('The design changed or preview was cancelled.')
    draft=await applyEngineeringOperation(draft,op,controller.signal)
    if(op.type==='set-parameter'&&!draft.nodes.some(n=>!n.suppressed&&n.boolean==='add')){
     if(generation!==this.generation)return
     this.update({status:'evaluating',plan,source,step:index+1});continue
    }
    mesh=await this.evaluate(draft,controller.signal)
    if(!Number.isInteger(mesh.triangleCount)||!mesh.triangleCount||!(mesh.volume>0)||!Number.isFinite(mesh.volume)||mesh.triangleCount>500000||!mesh.positions.length||mesh.positions.length%3||mesh.positions.length>4500000||mesh.indices.length!==mesh.triangleCount*3||mesh.positions.some(v=>!Number.isFinite(v))||mesh.indices.some(v=>!Number.isInteger(v)||v>=mesh!.positions.length/3||v<0))throw new Error('Operation produced invalid, empty or excessive geometry.')
    if(generation!==this.generation)return
    this.update({status:'evaluating',plan,source,step:index+1})
   }
   if(!this.sourceIsCurrent(source))throw new Error('The design changed while previewing. Submit a refreshed proposal.')
   if(!mesh?.triangleCount||!(mesh.volume>0))throw new Error('The final preview must contain a nonempty solid.')
   const history=[...(draft.engineering?.history??[]),{title:plan.title,appliedAt:new Date().toISOString(),operations:plan.operations,assumptions:plan.assumptions}].slice(-20)
   draft=parseModelDocument({...draft,revision:source.revision+1,updatedAt:new Date().toISOString(),engineering:{...draft.engineering,version:1,history}})
   if(generation===this.generation){this.readyFingerprint=JSON.stringify({draft,plan});this.update({status:'ready',plan,source,draft,mesh,step:plan.operations.length})}
  }catch(e){if(generation===this.generation)this.update({status:'error',plan,source,step:this.state.step,error:e instanceof Error?e.message:'Preview failed.'})}
 }
 async apply(){
  const {source,draft,plan}=this.state
  if(this.state.status!=='ready'||!source||!draft||!plan)throw new Error('Preview and validate the proposal first.')
  if(!this.sourceIsCurrent(source))throw new Error('The design changed. Submit a refreshed proposal.')
  if(JSON.stringify({draft,plan})!==this.readyFingerprint)throw new Error('The preview changed. Submit and validate a refreshed proposal.')
  const generation=this.generation
  if(plan.operations.some(o=>o.type==='split'))await this.checkpoint(source)
  if(!this.sourceIsCurrent(source)||generation!==this.generation||this.state.status!=='ready'||JSON.stringify({draft,plan})!==this.readyFingerprint)throw new Error('The design changed before Apply. Preview again.')
  this.commit(draft);this.generation++;this.update({status:'applied',plan,step:plan.operations.length})
 }
}
