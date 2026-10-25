import {useMemo,useState} from 'react'
import {useEditor} from '@/store/editor'
import {createAttachedHole,resolveAttachedHoles,supportedHoleTarget,type AttachedFace} from '@/lib/attachedHoles'
import {EdgeFinishingPanel} from './EdgeFinishingPanel'
import type {ModelNode} from '@formforge/model'
export function MechanicalFeaturesPanel(){
 const doc=useEditor(s=>s.document),selected=useEditor(s=>s.selectedNodeId),targets=doc.nodes.filter(supportedHoleTarget)
 const [targetId,setTargetId]=useState(selected??targets[0]?.id??''),[face,setFace]=useState<AttachedFace>('z+'),[diameter,setDiameter]=useState('4'),[u,setU]=useState('0'),[v,setV]=useState('0'),[depth,setDepth]=useState('5'),[through,setThrough]=useState(true),[error,setError]=useState('')
 const issues=useMemo(()=>resolveAttachedHoles(doc).errors,[doc]),node=doc.nodes.find(n=>n.id===selected),target=targets.find(n=>n.id===targetId)
 const run=(fn:()=>void)=>{try{fn();setError('')}catch(e){setError((e as Error).message)}}
 const attach=(repair?:ModelNode)=>{if(!target)throw new Error('Choose a supported target first.');if(target.locked||repair?.locked)throw new Error('Unlock the target and hole before editing.');if(doc.sculptStrokes.length)throw new Error('Bake volume sculpting before adding attached holes.');const hole=createAttachedHole(target,face,Number(diameter),Number(u),Number(v),through?'through':'blind',Number(depth));useEditor.getState().dispatch(repair?{type:'update-node',nodeId:repair.id,patch:{parameters:hole.parameters,transform:hole.transform,faceAttachment:hole.faceAttachment,assemblyPath:hole.assemblyPath,booleanPath:hole.booleanPath,combined:hole.combined,groupId:hole.groupId,groupOperation:hole.groupOperation,parameterBindings:undefined,kind:'cylinder',boolean:'cut'}}:{type:'add-node',node:hole});useEditor.getState().selectNode(repair?.id??hole.id);useEditor.getState().setShowResult(true)}
 const field=(label:string,value:string,set:(v:string)=>void)=><label className="cad-select-label">{label}<input type="number" step=".1" value={value} onChange={e=>set(e.target.value)}/></label>
 return <section className="workflow-card"><h3>Attached mechanical features</h3><p className="workflow-caption">A round hole follows a named box face or cylinder cap when you resize or rotate its target. Dimensions and offsets are in mm. Cuts affect only that target.</p>
  {!!Object.keys(issues).length&&<div role="alert">{Object.entries(issues).map(([id,message])=><p key={id}><button onClick={()=>useEditor.getState().selectNode(id)}>{doc.nodes.find(n=>n.id===id)?.name}</button>: {message}</p>)}</div>}
  <label className="cad-select-label">Hole target<select value={targetId} onChange={e=>{setTargetId(e.target.value);setFace('z+')}}><option value="">Choose box or cylinder</option>{targets.map(n=><option value={n.id} key={n.id}>{n.name}</option>)}</select></label>
  <label className="cad-select-label">Entry face<select value={face} onChange={e=>setFace(e.target.value as AttachedFace)}>{(target?.kind==='cylinder'?['z+','z-']:['z+','z-','x+','x-','y+','y-']).map(f=><option key={f} value={f}>{({ 'z+':'Top +Z','z-':'Bottom −Z','x+':'Right +X','x-':'Left −X','y+':'Back +Y','y-':'Front −Y'} as Record<string,string>)[f]}</option>)}</select></label>
  <div className="template-dimension-grid">{field('Hole diameter',diameter,setDiameter)}{field('Offset U from face center',u,setU)}{field('Offset V from face center',v,setV)}</div><p className="workflow-caption">U points along local X (local Y on X faces). V follows the face’s right-hand frame; use Solid result to inspect placement.</p>
  <label><input type="checkbox" checked={through} onChange={e=>setThrough(e.target.checked)}/> Through target</label>{!through&&field('Blind depth',depth,setDepth)}
  <button className="workflow-action" disabled={!target} onClick={()=>run(()=>attach())}>Add attached hole</button>
  {node?.faceAttachment&&<><p>Selected attachment: {node.faceAttachment.face}, U {node.faceAttachment.offsetU}, V {node.faceAttachment.offsetV} mm.</p><button className="workflow-action secondary" onClick={()=>run(()=>attach(node))}>Replace selected hole attachment with these settings</button><button className="workflow-text-action" onClick={()=>{const a=node.faceAttachment!;setTargetId(a.targetNodeId);setFace(a.face);setDiameter(String(node.parameters.radius*2));setU(String(a.offsetU));setV(String(a.offsetV));setDepth(String(a.depth));setThrough(a.depthMode==='through')}}>Load selected hole settings</button></>}
  <details data-cad-tool="edges"><summary>Chamfers and fillets</summary><EdgeFinishingPanel/></details>
  {error&&<p role="alert" className="workflow-error">{error}</p>}
 </section>
}
