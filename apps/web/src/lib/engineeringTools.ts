import {designPlanJsonSchema} from '@formforge/model'
import {useEditor} from '../store/editor'
import {engineeringSession,submitEngineeringPlan,discardEngineeringPlan} from './engineeringStudio'
import {engineeringFindings} from './engineeringFindings'
import {engineeringPrimitiveFields} from './engineeringOperations'
export type SiteTool={name:string;description:string;inputSchema:object;annotations?:{readOnlyHint?:boolean};execute:(input:unknown)=>unknown|Promise<unknown>}
export function engineeringTools():SiteTool[]{
 const empty={type:'object',properties:{},additionalProperties:false}
 const requireEmpty=(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('This tool accepts an empty object.')}
 const read=(name:string,description:string,action:()=>unknown):SiteTool=>({name,description,inputSchema:empty,annotations:{readOnlyHint:true},execute(input){requireEmpty(input);return action()}})
 return [
 read('printlab_read_design','Read the active PrintLab design, stable feature IDs, editable parameters, capabilities and missing-measurement guidance. Do not infer rack standards or device dimensions.',()=>{
 const s=useEditor.getState(),d=s.document
 return {projectId:d.id,revision:d.revision,units:'Geometry is in millimeters; UI display units: '+d.units,name:d.name,namedParameters:d.namedParameters,selectedIds:s.selectedNodeIds,
 nodes:d.nodes.slice(0,200).map(({id,name,kind,boolean,parameters,transform,parameterBindings,groupId,assemblyPath,faceAttachment,suppressed,locked})=>({id,name,kind,boolean,parameters,transform,parameterBindings,groupId,assemblyPath,faceAttachment,suppressed,locked})),
 truncated:d.nodes.length>200,engineering:d.engineering?{version:d.engineering.version,shelf:d.engineering.shelf,history:d.engineering.history.map(entry=>({title:entry.title,appliedAt:entry.appliedAt,operationCount:entry.operations.length}))}:undefined,capabilities:['editable primitives','named parameters','boolean groups','attached holes','linear/polar patterns','box rounding','orientation','mesh split with explicit Apply'],
 parameterFields:Object.fromEntries(Object.entries(engineeringPrimitiveFields).map(([kind,fields])=>[kind,fields.filter(field=>!['topWidth','topDepth','twist','count'].includes(field))])),limits:{operations:64,nodes:2000,triangles:500000},workflow:'Submit a plan. Unanswered questions block preview. Preview never commits. User clicks Apply. Re-read design after any edit. No arbitrary JavaScript. Ask device/rack measurements, cable clearance and hole dimensions.'}
 }),
 {name:'printlab_submit_plan',description:'Show a structured editable design proposal in PrintLab. Include missing measurements as questions, and separate assumptions from established requirements. Does not change the model.',inputSchema:designPlanJsonSchema,async execute(input){const p=await submitEngineeringPlan(input);return {status:'planned',title:p.title,questions:p.questions,operationCount:p.operations.length}}},
 {name:'printlab_preview_plan',description:'Start isolated geometry validation of the submitted plan. Read preview status until ready or error. Never applies changes.',inputSchema:empty,execute(input){requireEmpty(input);const state=engineeringSession.state;if(state.status==='evaluating')return {status:'evaluating'};if(!state.plan||!state.source||!state.plan.operations.length)throw new Error('Submit a plan with CAD operations before preview.');if(state.source!==useEditor.getState().document)throw new Error('The design changed. Submit a refreshed proposal.');if(state.plan?.questions.length)throw new Error('Answer the missing measurements and submit an updated plan first.');void engineeringSession.preview().catch(e=>useEditor.getState().setNotice(String(e)));return previewStatus()}},
 read('printlab_preview_status','Read the proposed geometry validation status and current-model freshness.',previewStatus),
 {name:'printlab_discard_plan',description:'Cancel and discard the pending engineering preview. Leaves the model unchanged.',inputSchema:empty,async execute(input){requireEmpty(input);await discardEngineeringPlan();return {status:'discarded'}}},
 read('printlab_engineering_findings','Read deterministic and heuristic findings for current evaluated geometry, separate from unverified AI claims.',()=>{const s=useEditor.getState();return engineeringFindings(s.document,s.meshDocument===s.document&&s.geometryStatus==='ready'&&!s.placingNodeId?s.mesh:null)})
 ]
}
export function previewStatus(){const s=engineeringSession.state;return {status:s.source&&s.source!==useEditor.getState().document?'stale':s.status,title:s.plan?.title,step:s.step,total:s.plan?.operations.length,error:s.error,requiresUserApply:s.status==='ready'&&s.source===useEditor.getState().document,volume:s.mesh?.volume,triangles:s.mesh?.triangleCount}}
export function registerEngineeringTools(registry:{registerTool:(tool:SiteTool,options?:{signal:AbortSignal})=>unknown},onError:(message:string)=>void){
 const lifecycle=new AbortController()
 for(const tool of engineeringTools())try{void Promise.resolve(registry.registerTool({...tool,async execute(input){try{return await tool.execute(input)}catch(error){return {error:error instanceof Error?error.message:'Tool failed.',modelUnchanged:true}}}}, {signal:lifecycle.signal})).catch(()=>onError('Site tools registration failed. Manual modeling is available.'))}catch{onError('Site tools registration failed. Manual modeling is available.')}
 return ()=>lifecycle.abort()
}
