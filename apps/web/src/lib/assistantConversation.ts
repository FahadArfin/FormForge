import {create} from 'zustand'
import {designPlanSchema,designPlanJsonSchema,parseModelDocument,type DesignPlan,type ModelDocument} from '@formforge/model'
import {useEditor} from '../store/editor'
import {db} from './db'
import {resolveDocumentParameterBindings} from './modelParameters'
import {rememberOpenedProject,readLastOpenedProject} from './projectResume'
import {engineeringSession,submitEngineeringPlan} from './engineeringStudio'

export type AssistantSource='webmcp'|'local'
export type AssistantMessageStatus='waiting'|'answered'|'cancelled'|'replaced'|'error'|'stale'
export interface AssistantMessage {
 id:string;role:'user'|'assistant';text:string;createdAt:string;source:AssistantSource
 status:AssistantMessageStatus;requestId:string;questions?:string[];plan?:DesignPlan
}
export interface AssistantRequest {
 id:string;projectId:string;revision:number;documentUpdatedAt:string;documentFingerprint:string
 prompt:string;selectedIds:string[];source:AssistantSource;model?:string;createdAt:string;status:'waiting'
}
export interface AssistantConversationRow {projectId:string;messages:AssistantMessage[];pending:AssistantRequest|null;updatedAt:string}
interface ConversationState {projectId:string|null;messages:AssistantMessage[];pending:AssistantRequest|null;loading:boolean;error:string|null}
export const useAssistantConversation=create<ConversationState>(()=>({projectId:null,messages:[],pending:null,loading:false,error:null}))
const MAX_MESSAGES=80,MAX_CHARACTERS=85000
let sourceDocument:ModelDocument|undefined,sourceSerialized='',loadGeneration=0,requestGeneration=0
let sourceProposal:unknown,storageReadFailed=false,retryLoad=false
let loadingPromise:Promise<void>|undefined
let writes:Promise<unknown>=Promise.resolve()
const now=()=>new Date().toISOString()
const notice=(error:string)=>useAssistantConversation.setState({error})
function bound(messages:AssistantMessage[]){const result=messages.slice(-MAX_MESSAGES);while(result.length>1&&JSON.stringify(result).length>MAX_CHARACTERS)result.shift();return result}
function persist(){
 const state=useAssistantConversation.getState();if(!state.projectId||state.loading||storageReadFailed)return
 const row:AssistantConversationRow={projectId:state.projectId,messages:structuredClone(bound(state.messages)),pending:state.pending?structuredClone(state.pending):null,updatedAt:now()}
 while(row.messages.length>1&&JSON.stringify(row).length>100000)row.messages.shift()
 writes=writes.catch(()=>undefined).then(()=>db.assistantConversations.put(row)).catch(()=>{if(useAssistantConversation.getState().projectId===row.projectId)notice('Conversation is available this session; local storage failed. Reloading may lose messages.')})
}
/** Explicitly await this in persistence tests or when closing a local conversation. */
export async function flushAssistantConversation(){await writes}
async function fingerprint(serialized:string){
 // Hydration applies schema defaults and binding/attachment resolution, and schema parsing
 // changes property insertion order. Canonicalize that same semantic document for reloads.
 // Live replies still require the original object identity and exact raw snapshot below.
 const normalized=resolveDocumentParameterBindings(parseModelDocument(JSON.parse(serialized))).document
 const canonical=JSON.stringify(normalized,(_key,value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)):value)
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))
 return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('')
}
function finishPending(status:AssistantMessageStatus){
 const state=useAssistantConversation.getState(),id=state.pending?.id
 if(id)useAssistantConversation.setState({pending:null,messages:state.messages.map(message=>message.requestId===id?{...message,status}:message)})
 sourceDocument=undefined;sourceSerialized='';sourceProposal=undefined
}
export async function loadConversation(projectId:string):Promise<void>{
 const previous=useAssistantConversation.getState()
 if(previous.projectId===projectId&&!retryLoad){if(previous.loading)await loadingPromise;return}
 const generation=++loadGeneration;++requestGeneration
 sourceDocument=undefined;sourceSerialized='';sourceProposal=undefined
 useAssistantConversation.setState({projectId,messages:[],pending:null,loading:true,error:null})
 storageReadFailed=false;retryLoad=false
 const work=(async()=>{
  try{
   await writes
   const stored=await db.assistantConversations.get(projectId)
   const row=stored===undefined?undefined:validateStoredConversation(stored,projectId)
   if(generation!==loadGeneration||useEditor.getState().document.id!==projectId)return
   const messages=bound(Array.isArray(row?.messages)?row.messages:[])
   let pending=row?.pending??null,error:string|null=null
   const document=useEditor.getState().document,serialized=JSON.stringify(document)
   if(pending){
    const same=pending.projectId===projectId&&pending.revision===document.revision&&pending.documentUpdatedAt===document.updatedAt&&pending.documentFingerprint===await fingerprint(serialized)
    if(generation!==loadGeneration||useEditor.getState().document!==document)return
    if(!same||pending.source==='local'){
     const id=pending.id,status=same?'cancelled':'stale'
     messages.forEach(message=>{if(message.requestId===id)message.status=status})
     error=same?'The previous local response was interrupted. Send your request again.':'The saved request refers to a changed design. Send a fresh request.';pending=null
    }else{sourceDocument=document;sourceSerialized=serialized;sourceProposal=engineeringSession.state}
   }
   if(generation!==loadGeneration||useEditor.getState().document!==document)return
   useAssistantConversation.setState({messages,pending,loading:false,error});persist()
  }catch{
   if(generation===loadGeneration){storageReadFailed=true;useAssistantConversation.setState({loading:false,error:'Saved conversation could not be loaded or is invalid. New messages will remain in this session; saved history will not be overwritten.'})}
  }finally{
   if(generation===loadGeneration&&useAssistantConversation.getState().loading){storageReadFailed=true;retryLoad=true;useAssistantConversation.setState({loading:false,error:'The design changed while conversation loaded. Send again to reload saved history safely.'})}
  }
 })()
 loadingPromise=work;await work
}
export async function queueAssistantRequest(text:string,options:{provider:AssistantSource;model?:string}):Promise<AssistantRequest>{
 const prompt=text.trim();if(!prompt||prompt.length>12000)throw new Error('Enter a request between 1 and 12,000 characters.')
 if(options.provider!=='webmcp'&&options.provider!=='local')throw new Error('Unknown assistant provider.')
 if(options.model&&options.model.length>200)throw new Error('Model identifier is too long.')
 const document=useEditor.getState().document,selectedIds=useEditor.getState().selectedNodeIds.filter(id=>id.length<=200).slice(0,200),serialized=JSON.stringify(document)
 const loading=loadConversation(document.id),generation=++requestGeneration
 await loading
 const documentFingerprint=await fingerprint(serialized)
 const assertCurrent=()=>{if(generation!==requestGeneration||useEditor.getState().document!==document||JSON.stringify(document)!==serialized||useAssistantConversation.getState().projectId!==document.id)throw new Error('The request was cancelled or the design changed. Send it again.')}
 assertCurrent()
 // Persist through the editor's serialized save queue so an untouched first project can be
 // resumed with its conversation, without racing autosaves or project deletion.
 const saved=await useEditor.getState().saveNow()
 assertCurrent()
 if(!saved)throw new Error('Save this project on your device before sending an assistant request. The project could not be saved.')
 rememberOpenedProject(document.id)
 const resumeWarning=readLastOpenedProject()!==document.id?'The project and chat are saved, but the browser could not remember this project for reload. Reopen it from Projects.':null
 finishPending('replaced')
 const request:AssistantRequest={id:crypto.randomUUID(),projectId:document.id,revision:document.revision,documentUpdatedAt:document.updatedAt,documentFingerprint,prompt,selectedIds,source:options.provider,model:options.model,createdAt:now(),status:'waiting'}
 sourceDocument=document;sourceSerialized=serialized;sourceProposal=engineeringSession.state
 const message:AssistantMessage={id:crypto.randomUUID(),role:'user',text:prompt,createdAt:request.createdAt,source:options.provider,status:'waiting',requestId:request.id}
 useAssistantConversation.setState(state=>({pending:request,messages:bound([...state.messages,message]),error:storageReadFailed?state.error:resumeWarning}));persist();return request
}
export function cancelAssistantRequest(requestId?:string){
 if(requestId&&useAssistantConversation.getState().pending?.id!==requestId)return
 ++requestGeneration;finishPending('cancelled');persist()
}
export function failAssistantRequest(requestId:string,message:string){
 if(useAssistantConversation.getState().pending?.id!==requestId)return
 finishPending('error');notice(message.slice(0,1000));persist()
}
export const assistantReplyJsonSchema={type:'object',additionalProperties:false,required:['requestId','projectId','revision','message'],properties:{requestId:{type:'string',minLength:1,maxLength:200},projectId:{type:'string',minLength:1,maxLength:200},revision:{type:'integer',minimum:0},message:{type:'string',minLength:1,maxLength:12000},questions:{type:'array',maxItems:20,items:{type:'string',minLength:1,maxLength:1000}},plan:designPlanJsonSchema}}
function parseReply(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Reply must be an object.')
 const value=input as Record<string,unknown>
 if(Object.keys(value).some(key=>!['requestId','projectId','revision','message','questions','plan'].includes(key)))throw new Error('Reply contains unsupported fields.')
 for(const key of ['requestId','projectId','message'])if(typeof value[key]!=='string'||!(value[key] as string).trim()||(value[key] as string).length>(key==='message'?12000:200))throw new Error(`Invalid reply ${key}.`)
 if(!Number.isSafeInteger(value.revision)||(value.revision as number)<0)throw new Error('Invalid reply revision.')
 const questions=value.questions??[]
 if(!Array.isArray(questions)||questions.length>20||questions.some(q=>typeof q!=='string'||!q.trim()||q.length>1000))throw new Error('Invalid reply questions.')
 let plan=value.plan===undefined?undefined:designPlanSchema.parse(value.plan)
 if(plan&&questions.length)plan=designPlanSchema.parse({...plan,questions:Array.from(new Set([...plan.questions,...questions]))})
 if(JSON.stringify(value).length>60000)throw new Error('Reply is too large. Keep the proposal focused.')
 return {requestId:value.requestId as string,projectId:value.projectId as string,revision:value.revision as number,message:value.message as string,questions:questions as string[],plan}
}
export async function receiveAssistantReply(input:unknown,source:AssistantSource='webmcp'):Promise<AssistantMessage>{
 const reply=parseReply(input),state=useAssistantConversation.getState(),request=state.pending,document=useEditor.getState().document
 if(!request||request.id!==reply.requestId)throw new Error('This request was replaced, cancelled, or already answered.')
 if(request.source!==source)throw new Error('Reply provider does not match the queued request.')
 if(state.projectId!==reply.projectId||request.projectId!==reply.projectId||document.id!==reply.projectId||request.revision!==reply.revision||document.revision!==reply.revision||document!==sourceDocument||JSON.stringify(document)!==sourceSerialized||engineeringSession.state!==sourceProposal){
  finishPending('stale');persist();throw new Error('The project, design, or pending proposal changed. Send a fresh request before replying.')
 }
 const message:AssistantMessage={id:crypto.randomUUID(),role:'assistant',text:reply.message,createdAt:now(),source,status:'answered',requestId:request.id,questions:reply.questions,plan:reply.plan}
 // submitEngineeringPlan captures and validates this same document synchronously before storage awaits.
 const submission=reply.plan?submitEngineeringPlan(reply.plan):undefined
 finishPending('answered')
 useAssistantConversation.setState(state=>({messages:bound([...state.messages,message])}));persist()
 await submission;return message
}
export function readAssistantConversation(){
 const state=useAssistantConversation.getState(),document=useEditor.getState().document
 if(state.projectId!==document.id||state.loading)return {projectId:document.id,loading:true,messages:[],pending:null}
 const pending=state.pending
 const stale=!!pending&&(document!==sourceDocument||JSON.stringify(document)!==sourceSerialized||engineeringSession.state!==sourceProposal)
 return {projectId:state.projectId,revision:document.revision,messages:structuredClone(state.messages.slice(-20)),pending:pending?{...pending,status:stale?'stale':pending.status}:null,error:state.error,workflow:'Queued requests do not automatically wake ChatGPT. Read the request and current design, then call printlab_reply_to_request with its requestId, projectId and revision. Only the user can Apply geometry.'}
}
export function assistantHandoff(request:AssistantRequest|null=useAssistantConversation.getState().pending){
 if(!request)return 'Open PrintLab and enter a request in the assistant first.'
 return `Please help with this PrintLab request through its connected site tools.\nRequest: ${request.id}\nProject: ${request.projectId}\nRevision: ${request.revision}\nSelected feature IDs: ${request.selectedIds.join(', ')||'(none)'}\n\n${request.prompt}\n\nCall printlab_read_conversation and printlab_read_design for current context, then printlab_reply_to_request with this requestId, projectId, revision, a message, and an optional schema-valid editable design plan. Ask for missing dimensions; the user reviews and clicks Apply. This text does not include the entire private model.`
}


function validateStoredConversation(input:unknown,projectId:string):AssistantConversationRow{
 const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
 const text=(value:unknown,max:number)=>typeof value==='string'&&value.length>0&&value.length<=max
 const timestamp=(value:unknown)=>text(value,50)&&Number.isFinite(Date.parse(value as string))
 const provider=(value:unknown)=>value==='webmcp'||value==='local'
 if(!record(input)||input.projectId!==projectId||!timestamp(input.updatedAt)||!Array.isArray(input.messages)||input.messages.length>80||JSON.stringify(input).length>120000)throw new Error('Invalid saved conversation.')
 for(const message of input.messages){
  if(!record(message)||!text(message.id,200)||!text(message.requestId,200)||!text(message.text,12000)||!timestamp(message.createdAt)||!provider(message.source)||!['user','assistant'].includes(message.role as string)||!['waiting','answered','cancelled','replaced','error','stale'].includes(message.status as string))throw new Error('Invalid saved message.')
  if(message.questions!==undefined&&(!Array.isArray(message.questions)||message.questions.length>20||message.questions.some(question=>!text(question,1000))))throw new Error('Invalid saved questions.')
  if(message.plan!==undefined)designPlanSchema.parse(message.plan)
 }
 const pending=input.pending
 if(pending!==null){
  if(!record(pending)||pending.projectId!==projectId||!text(pending.id,200)||!Number.isSafeInteger(pending.revision)||(pending.revision as number)<0||!text(pending.documentUpdatedAt,100)||typeof pending.documentFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(pending.documentFingerprint)||!text(pending.prompt,12000)||!timestamp(pending.createdAt)||!provider(pending.source)||pending.status!=='waiting'||!Array.isArray(pending.selectedIds)||pending.selectedIds.length>200||pending.selectedIds.some(id=>!text(id,200))||(pending.model!==undefined&&!text(pending.model,200))||!input.messages.some(message=>message.requestId===pending.id&&message.role==='user'&&message.status==='waiting'))throw new Error('Invalid saved request.')
 }
 return input as unknown as AssistantConversationRow
}
// Expire requests immediately on design replacement/edit, before any late provider response.
useEditor.subscribe((state,previous)=>{
 if(state.document===previous.document||!useAssistantConversation.getState().pending)return
 finishPending('stale');notice('The design changed. Send a fresh assistant request.');persist()
})
