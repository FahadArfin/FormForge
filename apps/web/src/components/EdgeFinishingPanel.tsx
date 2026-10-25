import { useEffect, useRef, useState } from 'react'
import type { BoxEdge, EdgeTreatment } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { boxEdges, edgeKey, selectedBoxEdges } from '@/geometry/edgeTreatment'
import { applyEdgeFinishing, previewEdgeFinishing, type EdgeFinishingPreview } from '@/lib/edgeFinishing'
import { parseNumericExpression } from '@/lib/numericExpression'
import { MeshPreview } from './MeshPreview'
import './EdgeFinishingPanel.css'

function edgeLabel(edge:BoxEdge) {
  if(edge.axis==='z')return `${edge.sideU===1?'Right':'Left'} ${edge.sideV===1?'back':'front'} upright`
  return `${edge.sideV===1?'Top':'Bottom'} ${edge.axis==='x'?(edge.sideU===1?'back':'front'):(edge.sideU===1?'right':'left')} edge`
}
function edgeLine(edge:BoxEdge) {
  const axis=['x','y','z'].indexOf(edge.axis),cross=[0,1,2].filter(n=>n!==axis)
  return [-1,1].map(side=>{const p=[0,0,0];p[axis]=side;p[cross[0]!]=edge.sideU;p[cross[1]!]=edge.sideV;return {x:100+40*p[0]!+25*p[1]!,y:82+15*p[0]!-20*p[1]!-40*p[2]!}})
}
export function EdgeFinishingPanel() {
  const document=useEditor(s=>s.document),selectedId=useEditor(s=>s.selectedNodeId),placing=useEditor(s=>s.placingNodeId),drawing=useEditor(s=>s.tool==='draw-profile')
  const boxes=document.nodes.filter(n=>n.kind==='box'&&!n.suppressed)
  const [targetId,setTargetId]=useState(selectedId??boxes[0]?.id??''),[mode,setMode]=useState<EdgeTreatment['mode']>('fillet'),[amount,setAmount]=useState('1'),[edges,setEdges]=useState<BoxEdge[]>(boxEdges)
  const [preview,setPreview]=useState<EdgeFinishingPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const task=useRef<AbortController|null>(null),previous=useRef(document),loadedTarget=useRef('')
  const target=boxes.find(n=>n.id===targetId)
  const invalidate=()=>{task.current?.abort();task.current=null;setBusy(false);setPreview(null);setError('');setMessage('')}
  useEffect(()=>()=>{task.current?.abort();task.current=null},[])
  useEffect(()=>{if(previous.current!==document){const active=Boolean(task.current||preview);previous.current=document;invalidate();if(active)setMessage('Project changed. Preview the edges again before applying.')}},[document])
  useEffect(()=>{if(selectedId&&boxes.some(n=>n.id===selectedId))setTargetId(selectedId)},[selectedId])
  useEffect(()=>{
    if(loadedTarget.current===targetId)return
    loadedTarget.current=targetId;invalidate()
    const existing=target?.edgeTreatment
    setEdges(existing?selectedBoxEdges(existing):boxEdges);setAmount(String(existing?.amount??1));setMode(existing?.mode??'fillet')
  },[targetId])
  const blocked=Boolean(!target||target.locked||placing||drawing||document.sculptStrokes.length)
  const mixedFillets=mode==='fillet'&&edges.length!==12&&new Set(edges.map(e=>e.axis)).size>1
  const choose=(next:BoxEdge[])=>{invalidate();setEdges(next)}
  const toggle=(edge:BoxEdge)=>choose(edges.some(e=>edgeKey(e)===edgeKey(edge))?edges.filter(e=>edgeKey(e)!==edgeKey(edge)):[...edges,edge])
  const prepare=async()=>{
    if(blocked||mixedFillets||!edges.length)return
    invalidate();const controller=new AbortController();task.current=controller;setBusy(true)
    try {
      const treatment:EdgeTreatment={version:1,mode,amount:parseNumericExpression(amount,'mm'),...edges[0]!,edges}
      const result=await previewEdgeFinishing(()=>useEditor.getState().document,targetId,treatment,controller.signal)
      if(task.current===controller){setPreview(result);setMessage('Closed geometry checked. Review the finished design, then apply.')}
    }catch(cause){if(task.current===controller&&!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Unable to preview these edges.')}
    finally{if(task.current===controller){task.current=null;setBusy(false)}}
  }
  const apply=()=>{
    if(!preview)return
    try {
      const state=useEditor.getState()
      if(state.placingNodeId||state.tool==='draw-profile')throw new Error('Finish or cancel the current drawing first.')
      applyEdgeFinishing(()=>useEditor.getState().document,preview,(id,edgeTreatment)=>state.updateNode(id,{edgeTreatment}))
      state.setShowResult(true);state.setNotice(`${preview.treatment.edges?.length??1} edges finished. The box stays editable; Undo restores the previous finish.`);invalidate()
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to apply the finish.')}
  }
  return <section className="edge-finishing" aria-labelledby="edge-finishing-title">
    <h3 id="edge-finishing-title">Finish box edges</h3>
    <p className="workflow-caption">Soften a whole box or a few edges. The original box and its dimensions stay editable.</p>
    <label className="cad-select-label">Box to finish<select aria-label="Box to finish" value={targetId} onChange={event=>setTargetId(event.target.value)}><option value="">Choose a box</option>{boxes.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    <div className="edge-mode" role="group" aria-label="Edge finish">{(['fillet','chamfer'] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>{invalidate();setMode(value);if(value==='fillet'&&edges.length!==12&&new Set(edges.map(e=>e.axis)).size>1)setEdges(boxEdges)}}>{value==='fillet'?'Round · Fillet':'Bevel · Chamfer'}</button>)}</div>
    <div className="edge-presets" role="group" aria-label="Edge selection presets">
      {[{label:'All edges',edges:boxEdges},{label:'Upright edges',edges:boxEdges.filter(e=>e.axis==='z')},...(mode==='chamfer'?[{label:'Top rim',edges:boxEdges.filter(e=>e.axis!=='z'&&e.sideV===1)},{label:'Bottom rim',edges:boxEdges.filter(e=>e.axis!=='z'&&e.sideV===-1)}]:[{label:'Width direction',edges:boxEdges.filter(e=>e.axis==='x')},{label:'Depth direction',edges:boxEdges.filter(e=>e.axis==='y')}])].map(preset=><button key={preset.label} type="button" aria-pressed={edges.length===preset.edges.length&&preset.edges.every(e=>edges.some(selected=>edgeKey(e)===edgeKey(selected)))} onClick={()=>choose(preset.edges)}>{preset.label}</button>)}
    </div>
    <svg className="edge-diagram" viewBox="0 0 200 164" aria-label="Choose box edges" role="group">
      {boxEdges.map(edge=>{const [start,end]=edgeLine(edge),active=edges.some(e=>edgeKey(e)===edgeKey(edge));return <g key={edgeKey(edge)} className={active?'selected':''}>
        <line x1={start!.x} y1={start!.y} x2={end!.x} y2={end!.y} className="edge-visible"/>
        <line x1={start!.x} y1={start!.y} x2={end!.x} y2={end!.y} className="edge-hit" role="button" tabIndex={0} aria-label={edgeLabel(edge)} aria-pressed={active} onClick={()=>toggle(edge)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle(edge)}}}><title>{edgeLabel(edge)}</title></line>
      </g>})}
    </svg>
    <p className="workflow-caption">{edges.length} of 12 edges selected · click the diagram to customize. Diagram uses the box’s local axes.</p>
    {mode==='fillet'&&<p className="workflow-caption">All edges blends the corners too. Custom fillets must follow one direction; mixed directions need All edges or Chamfer. Curves are faceted approximations.</p>}
    {mixedFillets&&<p className="workflow-warning" role="status">Choose parallel edges or All edges for fillets.</p>}
    <form onSubmit={event=>{event.preventDefault();void prepare()}}>
      <label className="cad-select-label">{mode==='fillet'?'Radius (mm)':'Setback (mm)'}<input type="text" inputMode="decimal" maxLength={48} value={amount} onChange={event=>{invalidate();setAmount(event.target.value)}}/></label>
      <p className="workflow-caption">Keep this smaller than half each adjacent face. Use an unscaled box without attached holes, deformation or surface modifiers. Ordinary cutout shapes are supported.</p>
      {!target&&<p className="workflow-warning">Choose a visible parametric box. Imported meshes and other shapes cannot use this tool.</p>}
      {!!document.sculptStrokes.length&&<p className="workflow-warning">Edge finishing is unavailable while this project has volume sculpting. Undo the sculpt strokes to finish the original box, or use a project without sculpting.</p>}
      {(placing||drawing)&&<p className="workflow-warning">Finish or cancel the current drawing first.</p>}
      {target?.locked&&<p className="workflow-warning">Unlock the box to finish its edges.</p>}
      <div className="workflow-actions"><button type="submit" className="workflow-action" disabled={blocked||busy||mixedFillets||!edges.length}>{busy?'Checking edges…':'Preview edge finish'}</button>{(busy||preview)&&<button type="button" className="workflow-action secondary" onClick={()=>{invalidate();setMessage('Preview discarded. Your model is unchanged.')}}>Discard edge preview</button>}</div>
    </form>
    {error&&<p className="workflow-error" role="alert">{error}</p>}{message&&<p className="workflow-caption" role="status">{message}</p>}
    {preview&&preview.source===document&&<div className="edge-preview"><MeshPreview mesh={preview.mesh} label="Finished design preview"/><button type="button" className="workflow-action" disabled={blocked} onClick={apply}>Apply edge finish</button><p className="workflow-caption">Preview shows the entire design. Apply is one undoable change. Solid result displays the finish; Edit shapes keeps the original box outline.</p></div>}
    {target?.edgeTreatment&&<button type="button" className="workflow-text-action" disabled={blocked} onClick={()=>{invalidate();useEditor.getState().updateNode(targetId,{edgeTreatment:undefined})}}>Remove edge finish</button>}
  </section>
}
