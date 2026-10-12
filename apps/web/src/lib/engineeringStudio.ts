import {create} from 'zustand'
import {designPlanSchema,type DesignPlan} from '@formforge/model'
import {useEditor} from '../store/editor'
import {EngineeringSession} from './engineeringSession'
import {evaluateSnapshot} from '../geometry/evaluateSnapshot'
import {db,saveVersion} from './db'
export const useEngineeringMode=create<{enabled:boolean;setEnabled:(enabled:boolean)=>void}>(set=>({enabled:false,setEnabled:enabled=>set({enabled})}))
export const useAssistantDock=create<{open:boolean;setOpen:(open:boolean)=>void}>(set=>({open:false,setOpen:open=>set({open})}))
export const engineeringSession=new EngineeringSession(()=>useEditor.getState().document,doc=>{
 const state=useEditor.getState()
 if(state.placingNodeId||state.tool==='draw-profile')throw new Error('Finish or cancel the current placement before applying a proposal.')
 state.dispatch({type:'replace-document',document:doc})
 if(useEditor.getState().document===state.document)throw new Error('The editor rejected this change. Check locked features.')
 void clearSavedPlan(doc.id,engineeringSession.state.plan).catch(()=>useEditor.getState().setNotice('Applied proposal; pending-plan cleanup failed.'));
 useEditor.getState().setShowResult(true);useEditor.getState().setNotice('Engineering proposal applied. Undo restores the previous design.')
},evaluateSnapshot,doc=>saveVersion(doc,'Before engineering mesh split'))
export async function submitEngineeringPlan(input:unknown){
 const plan=engineeringSession.submit(input);useAssistantDock.getState().setOpen(true)
 try{await db.engineeringPlans.put({projectId:useEditor.getState().document.id,plan,updatedAt:new Date().toISOString()})}catch{useEditor.getState().setNotice('Plan is available this session; local plan storage failed.')}
 return plan
}
export async function restoreEngineeringPlan(projectId:string){
 const pendingState=engineeringSession.state
 const row=await db.engineeringPlans.get(projectId)
 if(row&&useEditor.getState().document.id===projectId&&engineeringSession.state===pendingState&&engineeringSession.state.status==='idle')engineeringSession.submit(designPlanSchema.parse(row.plan))
}
export function simplePlan(title:string,operations:DesignPlan['operations']):DesignPlan{return {version:1,title,requirements:[],questions:[],assumptions:[],expectedChecks:['Evaluate closed solid','Review dimensions and build volume'],operations}}

async function clearSavedPlan(projectId:string,plan:DesignPlan|undefined){
 await db.transaction('rw',db.engineeringPlans,async()=>{const row=await db.engineeringPlans.get(projectId);if(row&&JSON.stringify(row.plan)===JSON.stringify(plan))await db.engineeringPlans.delete(projectId)})
}
export async function discardEngineeringPlan(){const id=useEditor.getState().document.id,plan=engineeringSession.state.plan;engineeringSession.discard();try{await clearSavedPlan(id,plan)}catch{useEditor.getState().setNotice('Preview discarded; stored plan could not be removed.')}}
