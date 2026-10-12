import {beforeEach,it,expect,vi} from 'vitest'
import {createDocument,type DesignPlan,type ModelDocument,type MeshPayload} from '@formforge/model'

const fixture=vi.hoisted(()=>({
 rows:new Map<string,{projectId:string;plan:unknown;updatedAt:string}>(),
 current:null as unknown as {document:ModelDocument;placingNodeId:null;tool:string;dispatch:(command:{document:ModelDocument})=>void;setNotice:ReturnType<typeof vi.fn>;setShowResult:ReturnType<typeof vi.fn>},
 get:vi.fn(),put:vi.fn(),remove:vi.fn(),transaction:vi.fn(),
}))
vi.mock('../store/editor',()=>({useEditor:{getState:()=>fixture.current}}))
vi.mock('./db',()=>({db:{engineeringPlans:{get:fixture.get,put:fixture.put,delete:fixture.remove},transaction:fixture.transaction},saveVersion:vi.fn(async()=>{})}))
vi.mock('../geometry/evaluateSnapshot',()=>({evaluateSnapshot:vi.fn(async()=>({positions:new Float32Array([0,0,0,1,0,0,0,1,1]),indices:new Uint32Array([0,1,2]),triangleCount:1,volume:1} as MeshPayload))}))
import {engineeringSession,submitEngineeringPlan,discardEngineeringPlan,restoreEngineeringPlan,simplePlan} from './engineeringStudio'

const plan=(title='Plate'):DesignPlan=>simplePlan(title,[{type:'create-feature',id:title,name:title,kind:'box',boolean:'add',position:{x:0,y:0,z:2},parameters:{width:40,depth:30,height:4}}])
beforeEach(()=>{
 engineeringSession.discard();fixture.rows.clear()
 fixture.get.mockReset().mockImplementation(async(id:string)=>fixture.rows.get(id))
 fixture.put.mockReset().mockImplementation(async(row)=>{fixture.rows.set(row.projectId,row)})
 fixture.remove.mockReset().mockImplementation(async(id:string)=>{fixture.rows.delete(id)})
 fixture.transaction.mockReset().mockImplementation(async(_mode,_table,work)=>work())
 fixture.current={document:createDocument(),placingNodeId:null,tool:'select',dispatch(command){fixture.current={...fixture.current,document:command.document}},setNotice:vi.fn(),setShowResult:vi.fn()}
})
it('discard removes a saved proposal so reopening the project cannot restore it',async()=>{
 const id=fixture.current.document.id
 await submitEngineeringPlan(plan());expect(fixture.rows.has(id)).toBe(true)
 await discardEngineeringPlan();expect(fixture.rows.has(id)).toBe(false)
 await restoreEngineeringPlan(id);expect(engineeringSession.state.status).toBe('idle')
})
it('discard prevents an already-pending storage read from reviving a plan',async()=>{
 const id=fixture.current.document.id,row={projectId:id,plan:plan(),updatedAt:'2026-10-12'}
 let finish!:(value:typeof row)=>void
 fixture.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const restoring=restoreEngineeringPlan(id)
 await discardEngineeringPlan();finish(row);await restoring
 expect(engineeringSession.state.status).toBe('idle')
})
it('a late restore does not replace a newer submission or a different project',async()=>{
 const id=fixture.current.document.id,row={projectId:id,plan:plan('Old'),updatedAt:'2026-10-12'}
 let finish!:(value:typeof row)=>void
 fixture.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 const restoring=restoreEngineeringPlan(id)
 await submitEngineeringPlan(plan('New'));finish(row);await restoring
 expect(engineeringSession.state.plan?.title).toBe('New')
 engineeringSession.discard();fixture.current={...fixture.current,document:createDocument()}
 fixture.get.mockResolvedValueOnce(row);await restoreEngineeringPlan(id)
 expect(engineeringSession.state.status).toBe('idle')
})
it('successful Apply clears the matching saved pending proposal',async()=>{
 const id=fixture.current.document.id
 await submitEngineeringPlan(plan());await engineeringSession.preview();await engineeringSession.apply()
 await vi.waitFor(()=>expect(fixture.rows.has(id)).toBe(false))
 expect(engineeringSession.state.status).toBe('applied')
 engineeringSession.discard();await restoreEngineeringPlan(id)
 expect(engineeringSession.state.status).toBe('idle')
})
it('late Apply cleanup preserves a newer proposal saved to the same project',async()=>{
 const id=fixture.current.document.id
 let cleanup!:(()=>Promise<void>)
 fixture.transaction.mockImplementationOnce(async(_mode,_table,work)=>{cleanup=work})
 await submitEngineeringPlan(plan());await engineeringSession.preview();await engineeringSession.apply()
 await submitEngineeringPlan(plan('New'))
 await cleanup()
 expect(fixture.rows.get(id)?.plan).toEqual(plan('New'))
 expect(engineeringSession.state.plan?.title).toBe('New')
})

