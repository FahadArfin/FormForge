// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest'
import {createDocument,type DesignPlan} from '@formforge/model'
import {useEditor} from '../store/editor'
import {engineeringTools,previewStatus} from './engineeringTools'
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
