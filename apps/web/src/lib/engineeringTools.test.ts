// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest'
import {createDocument,createNode,type DesignPlan} from '@formforge/model'
import {useEditor} from '../store/editor'
import {engineeringTools,previewStatus} from './engineeringTools'
const conversation=vi.hoisted(()=>({load:vi.fn(async()=>undefined),read:vi.fn(()=>({pending:{id:'queued'}})),reply:vi.fn(async()=>({id:'answer',requestId:'queued',plan:undefined}))}))
vi.mock('./assistantConversation',()=>({assistantReplyJsonSchema:{properties:{}},loadConversation:conversation.load,readAssistantConversation:conversation.read,receiveAssistantReply:conversation.reply}))
const bridge=vi.hoisted(()=>({discard:vi.fn(async()=>undefined),submit:vi.fn(),session:{state:{} as Record<string,unknown>,preview:vi.fn()}}))
vi.mock('./engineeringStudio',()=>({engineeringSession:bridge.session,submitEngineeringPlan:bridge.submit,discardEngineeringPlan:bridge.discard}))
vi.mock('@/geometry/client',()=>({geometryClient:{evaluate:vi.fn(()=>new Promise(()=>undefined))}}))
vi.mock('@/lib/db',()=>({saveProject:vi.fn(async()=>undefined),loadMostRecentProject:vi.fn(),deleteProject:vi.fn()}))
beforeEach(()=>{const document=createDocument();useEditor.setState({document,mesh:null,meshDocument:null,geometryStatus:'idle',placingNodeId:null});bridge.session.state={status:'idle',step:0};bridge.discard.mockClear()})
const tool=(name:string)=>engineeringTools().find(t=>t.name===name)!
it('routes discard through persistent plan cleanup',async()=>{
 await tool('printlab_discard_plan').execute({});expect(bridge.discard).toHaveBeenCalledTimes(1)
})
it('reports stale previews without advertising Apply and rejects missing plans synchronously',()=>{
 bridge.session.state={status:'ready',source:createDocument(),step:1}
 expect(previewStatus()).toMatchObject({status:'stale',requiresUserApply:false})
 expect(()=>tool('printlab_preview_plan').execute({})).toThrow(/Submit/)
})
it('only reports mesh findings when the current geometry is ready and not being placed',()=>{
 const doc=useEditor.getState().document
 useEditor.setState({meshDocument:doc,geometryStatus:'error',mesh:{positions:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:new Uint32Array([0,1,2]),triangleCount:1,volume:1}})
 const findings=tool('printlab_engineering_findings').execute({}) as {id:string;status:string}[]
 expect(findings.find(f=>f.id==='build-volume')?.status).toBe('unknown')
 useEditor.setState({geometryStatus:'ready',placingNodeId:'preview'})
 expect((tool('printlab_engineering_findings').execute({}) as typeof findings).find(f=>f.id==='build-volume')?.status).toBe('unknown')
})
it('summarizes saved operation history rather than repeating entire prior plans',()=>{
 const doc=useEditor.getState().document,operations:DesignPlan['operations']=[{type:'place-on-bed'}]
 useEditor.setState({document:{...doc,engineering:{version:1,history:[{title:'Placement',appliedAt:'now',operations,assumptions:['long private design note']}]}}})
 const result=tool('printlab_read_design').execute({}) as {engineering:{history:unknown[]}}
 expect(result.engineering.history).toEqual([{title:'Placement',appliedAt:'now',operationCount:1}])
})

it('routes queued request reads and responses through the conversation service',async()=>{
 const document=useEditor.getState().document
 const result=await tool('printlab_read_conversation').execute({}) as {pending:{id:string};design:{projectId:string}}
 expect(conversation.load).toHaveBeenCalledWith(document.id)
 expect(result).toMatchObject({pending:{id:'queued'},design:{projectId:document.id}})
 const reply={requestId:'queued',projectId:document.id,revision:document.revision,message:'Please measure spacing.'}
 expect(await tool('printlab_reply_to_request').execute(reply)).toMatchObject({status:'answered',requestId:'queued'})
 expect(conversation.reply).toHaveBeenCalledWith(reply,'webmcp')
 expect(engineeringTools().some(tool=>/apply|export|delete/i.test(tool.name))).toBe(false)
})
it('selects verified feature IDs and rejects stale or invalid selections without model writes',()=>{
 const doc={...createDocument(),nodes:[createNode('box'),createNode('sphere')]}
 useEditor.setState({document:doc,selectedNodeIds:[],selectedNodeId:null,tool:'select'})
 const ids=doc.nodes.map(node=>node.id)
 expect(tool('printlab_select_features').execute({projectId:doc.id,revision:doc.revision,featureIds:ids})).toMatchObject({selectedIds:ids,modelUnchanged:true})
 expect(useEditor.getState().document).toBe(doc)
 expect(()=>tool('printlab_select_features').execute({projectId:doc.id,revision:doc.revision+1,featureIds:[ids[0]]})).toThrow(/current project/)
 expect(()=>tool('printlab_select_features').execute({projectId:doc.id,revision:doc.revision,featureIds:['missing']})).toThrow(/existing feature/)
 expect(useEditor.getState().selectedNodeIds).toEqual(ids)
})
it('does not read a newly switched project into an earlier conversation request',async()=>{
 conversation.load.mockImplementationOnce(async()=>{useEditor.setState({document:createDocument()})})
 await expect(tool('printlab_read_conversation').execute({})).rejects.toThrow(/changed/)
})

it('reports resolved named parameter dimensions instead of stale underlying parameter values',()=>{
 const node=createNode('box');node.parameters.width=10;node.parameterBindings={width:'Width'}
 const document={...createDocument(),nodes:[node],namedParameters:[{id:'width',name:'Width',expression:'42',value:10,unit:'mm' as const}]}
 useEditor.setState({document})
 const result=tool('printlab_read_design').execute({}) as {nodes:{parameters:{width:number}}[];namedParameters:{value:number}[]}
 expect(result.nodes[0]?.parameters.width).toBe(42)
 expect(result.namedParameters[0]?.value).toBe(42)
 expect(useEditor.getState().document.nodes[0]?.parameters.width).toBe(10)
})
