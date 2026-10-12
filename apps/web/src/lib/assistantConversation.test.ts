// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import {webcrypto} from 'node:crypto'
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {createDocument,createNode,parseModelDocument,type DesignPlan} from '@formforge/model'
import {useEditor} from '../store/editor'
import {db,saveProject,loadMostRecentProject} from './db'
import {readLastOpenedProject,rememberOpenedProject} from './projectResume'
import {resolveDocumentParameterBindings} from './modelParameters'
import {useAssistantConversation,loadConversation,queueAssistantRequest,receiveAssistantReply,cancelAssistantRequest,flushAssistantConversation,assistantHandoff,readAssistantConversation} from './assistantConversation'
const bridge=vi.hoisted(()=>({submit:vi.fn(async(input:unknown)=>input),session:{state:{}}}))
vi.mock('./engineeringStudio',()=>({submitEngineeringPlan:bridge.submit,engineeringSession:bridge.session}))
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>undefined))}}))
const editorSaveNow=useEditor.getState().saveNow
beforeEach(async()=>{
 vi.stubGlobal('crypto',webcrypto)
 localStorage.clear()
 useEditor.setState({saveNow:editorSaveNow})
 await flushAssistantConversation();await db.assistantConversations.clear();await db.projects.clear()
 useAssistantConversation.setState({projectId:null,messages:[],pending:null,loading:false,error:null})
 useEditor.setState({document:createDocument(),selectedNodeIds:[],placingNodeId:null,tool:'select'})
 bridge.submit.mockClear()
})
afterEach(async()=>{await flushAssistantConversation();vi.restoreAllMocks();vi.unstubAllGlobals()})
const queue=(text='Make a bracket')=>queueAssistantRequest(text,{provider:'webmcp'})
const reply=(request:{id:string;projectId:string;revision:number},extra={})=>({requestId:request.id,projectId:request.projectId,revision:request.revision,message:'What mounting spacing is needed?',...extra})
const plan:DesignPlan={version:1,title:'Bracket',requirements:[],questions:[],assumptions:[],expectedChecks:[],operations:[{type:'place-on-bed'}]}
it('queues a persistent project request and accepts one matching answer without changing geometry',async()=>{
 const document=useEditor.getState().document,request=await queue()
 expect(readAssistantConversation()).toMatchObject({pending:{id:request.id,status:'waiting'}})
 await receiveAssistantReply(reply(request))
 expect(useAssistantConversation.getState().messages.map(m=>[m.role,m.status])).toEqual([['user','answered'],['assistant','answered']])
 expect(useEditor.getState().document).toBe(document)
 await expect(receiveAssistantReply(reply(request))).rejects.toThrow(/already answered/)
 await flushAssistantConversation()
 expect((await db.assistantConversations.get(document.id))?.messages).toHaveLength(2)
})
it('rejects cross-project and same-revision document replacement responses',async()=>{
 const request=await queue(),document=useEditor.getState().document
 useEditor.setState({document:{...document,name:'Imported replacement'}})
 await expect(receiveAssistantReply(reply(request,{plan}))).rejects.toThrow(/changed|cancelled/)
 expect(bridge.submit).not.toHaveBeenCalled()
 const another=await queue();useEditor.setState({document:createDocument()})
 await expect(receiveAssistantReply(reply(another,{plan}))).rejects.toThrow(/changed|cancelled/)
 expect(bridge.submit).not.toHaveBeenCalled()
})
it('rejects in-place content mutations despite unchanged document identity and revision',async()=>{
 const request=await queue();useEditor.getState().document.name='Changed in place'
 await expect(receiveAssistantReply(reply(request))).rejects.toThrow(/changed|cancelled/)
})
it('cancels and replaces requests using stable IDs, without allowing late replies',async()=>{
 const original=await queue(),replacement=await queue('Use a smaller bracket')
 await expect(receiveAssistantReply(reply(original,{plan}))).rejects.toThrow(/replaced/)
 cancelAssistantRequest(original.id);expect(useAssistantConversation.getState().pending?.id).toBe(replacement.id)
 cancelAssistantRequest();await expect(receiveAssistantReply(reply(replacement))).rejects.toThrow(/cancelled/)
 expect(useAssistantConversation.getState().messages.map(m=>m.status)).toEqual(['replaced','cancelled'])
})
it('rejects unknown fields and invalid plans before changing conversation or engineering proposal',async()=>{
 const request=await queue()
 await expect(receiveAssistantReply(reply(request,{execute:'alert(1)'}))).rejects.toThrow(/unsupported/)
 await expect(receiveAssistantReply(reply(request,{plan:{...plan,operations:[{type:'arbitrary-code'}]}}))).rejects.toThrow()
 expect(useAssistantConversation.getState().pending?.id).toBe(request.id)
 expect(bridge.submit).not.toHaveBeenCalled()
})
it('validates a plan and merges clarification questions into its preview-blocking questions',async()=>{
 const request=await queue();await receiveAssistantReply(reply(request,{plan,questions:['What is the hole diameter?']}))
 expect(bridge.submit).toHaveBeenCalledWith({...plan,questions:['What is the hole diameter?']})
 expect(useAssistantConversation.getState().messages.at(-1)?.plan?.questions).toEqual(['What is the hole diameter?'])
})
it('restores WebMCP waiting requests only for the exact saved document content',async()=>{
 const request=await queue();await flushAssistantConversation()
 useAssistantConversation.setState({projectId:null})
 await loadConversation(request.projectId)
 expect(useAssistantConversation.getState().pending?.id).toBe(request.id)
 await receiveAssistantReply(reply(request))
 const next=await queue();await flushAssistantConversation()
 useAssistantConversation.setState({projectId:null})
 useEditor.setState({document:{...useEditor.getState().document,name:'Backup import preserving revision'}})
 await loadConversation(next.projectId)
 expect(useAssistantConversation.getState().pending).toBeNull()
 expect(useAssistantConversation.getState().messages.at(-1)?.status).toBe('stale')
})
it('marks interrupted local inference cancelled on reload and rejects mismatched providers',async()=>{
 const request=await queueAssistantRequest('Make a bracket',{provider:'local',model:'example-model'})
 await expect(receiveAssistantReply(reply(request))).rejects.toThrow(/provider/)
 await flushAssistantConversation();useAssistantConversation.setState({projectId:null});await loadConversation(request.projectId)
 expect(useAssistantConversation.getState().pending).toBeNull()
 expect(useAssistantConversation.getState().error).toMatch(/interrupted/)
})
it('keeps transcripts out of project documents and handoffs do not dump private model content',async()=>{
 const document=useEditor.getState().document;document.name='Private model name';document.nodes=[{...createNode('box'),name:'Private feature name'}]
 useEditor.setState({selectedNodeIds:[document.nodes[0]!.id]})
 const request=await queue('Make a bracket');await saveProject(document)
 expect(JSON.stringify((await db.projects.get(document.id))?.document)).not.toContain('Make a bracket')
 const handoff=assistantHandoff(request)
 expect(handoff).toContain(request.id);expect(handoff).toContain(document.nodes[0]!.id)
 expect(handoff).not.toContain('Private model name');expect(handoff).not.toContain('Private feature name')
})
it('bounds persistent messages and total transcript size',async()=>{
 for(let i=0;i<90;i++){await queue(('Bracket '+i+' ').padEnd(3000,'x'))}
 await flushAssistantConversation()
 const state=useAssistantConversation.getState(),saved=await db.assistantConversations.get(useEditor.getState().document.id)
 expect(state.messages.length).toBeLessThanOrEqual(80);expect(JSON.stringify(saved?.messages).length).toBeLessThanOrEqual(100000)
 expect(state.messages.at(-1)?.requestId).toBe(state.pending?.id)
})
it('ignores a delayed project load after switching projects',async()=>{
 let finish!:(row:undefined)=>void
 const first=createDocument(),second=createDocument()
 vi.spyOn(db.assistantConversations,'get').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}) as never)
 useEditor.setState({document:first});const loading=loadConversation(first.id)
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 useEditor.setState({document:second});await loadConversation(second.id)
 finish(undefined);await loading
 expect(useAssistantConversation.getState()).toMatchObject({projectId:second.id,messages:[],loading:false})
})
it('cancellation while a queue is awaiting persistence prevents the request from appearing',async()=>{
 let finish!:(row:undefined)=>void
 vi.spyOn(db.assistantConversations,'get').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}) as never)
 const queuing=queue();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 cancelAssistantRequest();finish(undefined)
 await expect(queuing).rejects.toThrow(/cancelled/)
 expect(useAssistantConversation.getState().pending).toBeNull()
})
it('keeps an honest local-only notice after persistence failure',async()=>{
 vi.spyOn(db.assistantConversations,'put').mockRejectedValue(new Error('Storage full'))
 await queue();await flushAssistantConversation()
 expect(useAssistantConversation.getState().messages).toHaveLength(1)
 expect(useAssistantConversation.getState().error).toMatch(/storage failed/)
})

it('rejects old replies after a newer manual proposal replaces the pending proposal',async()=>{
 const request=await queue();bridge.session.state={newProposal:true}
 await expect(receiveAssistantReply(reply(request,{plan}))).rejects.toThrow(/proposal changed/)
 expect(bridge.submit).not.toHaveBeenCalled()
})
it('quarantines malformed persisted conversations and preserves them when new session messages are queued',async()=>{
 const document=useEditor.getState().document
 const corrupt={projectId:document.id,messages:[{text:{malicious:'not a string'}}],pending:null,updatedAt:new Date().toISOString()}
 await db.assistantConversations.put(corrupt as never)
 await loadConversation(document.id)
 expect(useAssistantConversation.getState()).toMatchObject({messages:[],pending:null,loading:false})
 expect(useAssistantConversation.getState().error).toMatch(/invalid/)
 await queue();await flushAssistantConversation()
 expect(await db.assistantConversations.get(document.id)).toEqual(corrupt)
})
it('expires waiting requests immediately when a design edit arrives',async()=>{
 await queue();useEditor.setState({document:{...useEditor.getState().document,revision:1}})
 expect(useAssistantConversation.getState().pending).toBeNull()
 expect(useAssistantConversation.getState().messages.at(-1)?.status).toBe('stale')
})

it('retries an abandoned same-project fingerprint load before persisting new messages',async()=>{
 const original=await queue('Original saved message');await flushAssistantConversation()
 useAssistantConversation.setState({projectId:null})
 const actualDigest=webcrypto.subtle.digest.bind(webcrypto.subtle)
 let resume!:()=>void
 const digest=vi.spyOn(webcrypto.subtle,'digest').mockImplementationOnce((...args)=>new Promise<ArrayBuffer>(resolve=>{resume=()=>{void actualDigest(...args).then(resolve)}}))
 const loading=loadConversation(original.projectId)
 await vi.waitFor(()=>expect(resume).toBeTypeOf('function'))
 useEditor.setState({document:{...useEditor.getState().document,name:'Changed during fingerprint'}})
 resume();await loading;digest.mockRestore()
 expect(useAssistantConversation.getState().error).toMatch(/changed while conversation loaded/)
 const next=await queue('A second request after reload')
 await flushAssistantConversation()
 const saved=await db.assistantConversations.get(original.projectId)
 expect(saved?.messages.map(message=>message.text)).toEqual(['Original saved message','A second request after reload'])
 expect(saved?.pending?.id).toBe(next.id)
})

it('persists an untouched first project and its resume ID before saving queued conversation',async()=>{
 const source=useEditor.getState().document
 expect(await db.projects.get(source.id)).toBeUndefined()
 expect(readLastOpenedProject()).toBeNull()
 const request=await queue('First message before any geometry edits')
 await flushAssistantConversation()
 expect(readLastOpenedProject()).toBe(source.id)
 const resumed=await loadMostRecentProject()
 expect(resumed?.document).toEqual(source)
 useAssistantConversation.setState({projectId:null,pending:null})
 const hydrated=resolveDocumentParameterBindings(parseModelDocument(resumed!.document)).document
 expect(JSON.stringify(hydrated)).not.toBe(JSON.stringify(source))
 useEditor.setState({document:hydrated})
 await loadConversation(resumed!.id)
 expect(useAssistantConversation.getState().messages.at(-1)?.text).toBe('First message before any geometry edits')
 expect(useAssistantConversation.getState().pending?.id).toBe(request.id)
})
it('does not overwrite the new project resume pointer when switching projects during a save',async()=>{
 let finish!:(saved:boolean)=>void
 useEditor.setState({saveNow:()=>new Promise(resolve=>{finish=resolve})})
 const original=useEditor.getState().document,queuing=queue()
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 const next=createDocument();useEditor.setState({document:next});rememberOpenedProject(next.id)
 finish(true)
 await expect(queuing).rejects.toThrow(/design changed/)
 await flushAssistantConversation()
 expect(readLastOpenedProject()).toBe(next.id)
 expect((await db.assistantConversations.get(original.id))?.messages??[]).toEqual([])
 expect(useAssistantConversation.getState().pending).toBeNull()
})
it('does not queue an orphaned conversation when its source project cannot be saved',async()=>{
 useEditor.setState({saveNow:async()=>false})
 await expect(queue()).rejects.toThrow(/project could not be saved/)
 expect(useAssistantConversation.getState().messages).toEqual([])
 expect(readLastOpenedProject()).toBeNull()
})

it('preserves queued requests after saved parametric models pass real hydration normalization',async()=>{
 const document=useEditor.getState().document,node=document.nodes[0]!
 node.parameterBindings={width:'PlateWidth'};node.parameters.width=10
 document.namedParameters=[{id:'width',name:'PlateWidth',expression:'',value:42,unit:'mm'}]
 const request=await queue('Keep this parametric plate editable');await flushAssistantConversation()
 const saved=await loadMostRecentProject()
 const hydrated=resolveDocumentParameterBindings(parseModelDocument(saved!.document)).document
 expect(hydrated.nodes[0]!.parameters.width).toBe(42)
 expect(document.nodes[0]!.parameters.width).toBe(10)
 useAssistantConversation.setState({projectId:null,pending:null});useEditor.setState({document:hydrated})
 await loadConversation(hydrated.id)
 expect(useAssistantConversation.getState().pending?.id).toBe(request.id)
 await receiveAssistantReply(reply(request))
})
it('still rejects a saved same-revision geometry edit after canonical reload normalization',async()=>{
 const request=await queue();await flushAssistantConversation()
 const saved=await loadMostRecentProject(),changed=parseModelDocument(saved!.document)
 changed.nodes[0]!.parameters.width+=1
 useAssistantConversation.setState({projectId:null,pending:null});useEditor.setState({document:changed})
 await loadConversation(changed.id)
 expect(useAssistantConversation.getState().pending).toBeNull()
 expect(useAssistantConversation.getState().messages.at(-1)?.status).toBe('stale')
 await expect(receiveAssistantReply(reply(request))).rejects.toThrow(/cancelled/)
})
