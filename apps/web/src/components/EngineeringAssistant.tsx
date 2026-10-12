import {AssistantChat} from './AssistantChat'
import {useEffect,useState,useSyncExternalStore} from 'react'
import {rackDimensionsSchema,type RackDimensions} from '@formforge/model'
import {engineeringSession,submitEngineeringPlan,simplePlan,discardEngineeringPlan} from '../lib/engineeringStudio'
import {useEditor} from '../store/editor'
import {MeshPreview} from './MeshPreview'
const labels:Record<keyof RackDimensions,string>={width:'Measured shelf width',depth:'Shelf depth',deviceWidth:'Device width',deviceDepth:'Device depth',deviceHeight:'Device height',thickness:'Plate thickness',earHeight:'Mounting ear height',holeDiameter:'Hole diameter',holeSpacing:'Hole center spacing',holeHeight:'Hole center height',cableClearance:'Cable clearance',slotCount:'Ventilation slot count',slotWidth:'Slot width',cornerRadius:'Plate corner radius'}
const example:RackDimensions={width:240,depth:150,deviceWidth:180,deviceDepth:120,deviceHeight:40,thickness:3,earHeight:30,holeDiameter:5,holeSpacing:220,holeHeight:15,cableClearance:15,slotCount:4,slotWidth:5,cornerRadius:1}
export function EngineeringAssistant({onClose}:{onClose:()=>void}){
 const state=useSyncExternalStore(engineeringSession.subscribe,engineeringSession.snapshot),doc=useEditor(s=>s.document)
 const [fields,setFields]=useState<Partial<Record<keyof RackDimensions,string>>>({}),[error,setError]=useState('')
 const [planText,setPlanText]=useState('')
 useEffect(()=>{setPlanText(state.plan?JSON.stringify(state.plan,null,2):'')},[state.plan])
 const stale=!!state.source&&state.source!==doc
 const act=async(action:()=>Promise<unknown>)=>{setError('');try{await action()}catch(e){setError((e as Error).message)}}
 const preview=()=>act(()=>engineeringSession.preview())
 const createShelf=()=>act(async()=>{
  const entries=Object.entries(labels),missing=entries.filter(([key])=>fields[key as keyof RackDimensions]===undefined||fields[key as keyof RackDimensions]==='')
  if(missing.length){await submitEngineeringPlan({...simplePlan('Ventilated rack shelf',[]),questions:missing.map(([,label])=>'What is the '+label.toLowerCase()+'?')});return}
  const dimensions=rackDimensionsSchema.parse(Object.fromEntries(entries.map(([key])=>[key,Number(fields[key as keyof RackDimensions])])))
  await submitEngineeringPlan({...simplePlan('Ventilated rack shelf',[{type:'rack-shelf',dimensions}]),requirements:['Use the entered measurements; all lengths are millimeters.'],assumptions:['Flat shelf and two front mounting ears; verify mounting layout and load suitability.']})
 })
 return <aside className="toolbox panel-surface engineering-assistant" aria-label="AI engineering assistant"><div className="engineering-heading"><span className="engineering-kicker">PRINTLAB ENGINEERING</span><button aria-label="Close assistant panel" onClick={onClose}>×</button></div>
 <AssistantChat/>
 {state.plan&&<section className="engineering-plan" aria-label="Design proposal"><span className="engineering-kicker">{stale?'Model changed · refresh proposal':state.status}</span><h3>{state.plan.title}</h3>
 {(['requirements','questions','assumptions','expectedChecks'] as const).map(key=>!!state.plan![key].length&&<div key={key}><h4>{key==='expectedChecks'?'Checks to perform':key}</h4><ul>{state.plan![key].map((value,i)=><li key={i}>{value}</li>)}</ul></div>)}
 <details><summary>Edit structured plan</summary><p>Adjust parameters, requirements, or resolved questions, then validate the updated plan before previewing.</p><textarea aria-label="Editable design plan JSON" value={planText} onChange={e=>setPlanText(e.target.value)} maxLength={200000}/><button onClick={()=>act(()=>submitEngineeringPlan(JSON.parse(planText)))}>Validate edited plan</button></details>
 <details><summary>{state.plan.operations.length} proposed operations</summary><ol>{state.plan.operations.map((op,i)=><li key={i}>{op.type}{'nodeId' in op?' · '+op.nodeId:''}{'name' in op?' · '+op.name:''}</li>)}</ol></details>
 {state.plan.operations.some(o=>o.type==='split')&&<p className="workflow-error">Splitting converts the result into meshes. Original parametric features are preserved in a checkpoint and Undo history.</p>}
 {state.status==='evaluating'&&<p role="status">Validating operation {state.step+1} of {state.plan.operations.length}…</p>}
 {state.error&&<p role="alert">{state.error}</p>}
 <div className="workflow-actions"><button className="workflow-action" disabled={stale||state.status==='evaluating'||!!state.plan.questions.length||!state.plan.operations.length} onClick={preview}>Preview proposal</button><button className="workflow-action secondary" onClick={()=>void discardEngineeringPlan()}>Discard</button></div>
 </section>}
 <details className="engineering-recipe"><summary>Measured rack-shelf designer</summary><p>Enter your measurements in mm. A nominal rack name does not establish mounting spacing. This adds a shelf to the current model.</p><button className="workflow-text-action" onClick={()=>setFields(Object.fromEntries(Object.entries(example).map(([key,value])=>[key,String(value)])))}>Load illustrative measurements</button><div className="engineering-fields">{Object.entries(labels).map(([key,label])=><label key={key}>{label}<input type="number" step={key==='slotCount'?1:.1} aria-label={label} value={fields[key as keyof RackDimensions]??''} placeholder="Required" onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}</div><button className="workflow-action" onClick={createShelf}>Create shelf plan</button></details>
 {error&&<p role="alert" className="workflow-error">{error}</p>}
 <p className="workflow-caption">AI suggestions are unverified until checked. Geometry checks do not certify strength, thermal performance, or physical fit.</p></aside>
}
export function EngineeringPreview(){
 const state=useSyncExternalStore(engineeringSession.subscribe,engineeringSession.snapshot),doc=useEditor(s=>s.document)
 const [compare,setCompare]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 if(state.status!=='ready'||!state.mesh)return null
 const stale=state.source!==doc
 return <div className={'engineering-preview '+(compare?'compare':'')}><div className="engineering-preview-header"><div><strong>Proposal preview</strong><span>{state.plan?.title} · {state.mesh.volume.toFixed(0)} mm³</span></div><button onClick={()=>setCompare(!compare)}>{compare?'Show proposal':'Compare original'}</button></div>
 {!compare&&<MeshPreview mesh={state.mesh} label="Engineering proposal geometry"/>}
 <div className="engineering-preview-footer"><p>{stale?'The model changed. Discard and submit a refreshed plan.':'Original design is unchanged. Apply creates one Undo step.'}</p><button className="workflow-action" disabled={stale||busy} onClick={async()=>{setBusy(true);setError('');try{await engineeringSession.apply()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>Apply proposal</button><button className="workflow-action secondary" onClick={()=>void discardEngineeringPlan()}>Discard</button>{error&&<p role="alert">{error}</p>}</div></div>
}
