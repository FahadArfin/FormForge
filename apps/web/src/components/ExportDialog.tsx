import { arrangeMesh } from '@/lib/plateLayout'
import { printReport } from '@/lib/printReport'
import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeForPrint, type ModelDocument, type MeshPayload } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { createExportDocument, createVisibleExportDocument } from '@/lib/exportScope'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { meshBounds } from '@/lib/importReview'
import { downloadBlob, safeFilename } from '@/lib/download'
import { export3mf, exportStl, exportObj, exportGlb, exportMultiColor3mf } from '@/lib/exporters'
import { WorkspaceDialog } from './WorkspaceDialog'
import { OverhangReview } from './OverhangReview'
const formats=[['3mf','3MF · recommended','Units included for slicing'],['stl','STL','Universal triangle mesh, millimeters'],['project','Editable backup','Complete project with editable shapes'],['glb','GLB','For web and other 3D apps'],['obj','OBJ','Evaluated triangle mesh'],['ams','Multi-color 3MF','Separate solid parts with material slots']]
export function ExportDialog({onClose,initialFormat='3mf'}:{onClose:()=>void;initialFormat?:string}) {
 const doc=useEditor(s=>s.document),ids=useEditor(s=>s.selectedNodeIds),placing=useEditor(s=>s.placingNodeId)
 const [scope,setScope]=useState<'document'|'selection'|'visible'>('document'),[format,setFormat]=useState(initialFormat),[mesh,setMesh]=useState<MeshPayload|null>(null),[building,setBuilding]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[downloaded,setDownloaded]=useState(false)
 const [arrange,setArrange]=useState(false),[gap,setGap]=useState('3'),[margin,setMargin]=useState('3')
 const [builtScope,setBuiltScope]=useState<ModelDocument|null>(null)
 const generation=useRef(0),alive=useRef(true)
 const scoped=useMemo(()=>{try{return{document:scope==='selection'?createExportDocument(doc,ids):scope==='visible'?createVisibleExportDocument(doc):doc,error:''}}catch(e){return{document:null,error:(e as Error).message}}},[doc,ids,scope])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++}},[])
 useEffect(()=>{const token=++generation.current,controller=new AbortController();setMesh(null);setError('');setDownloaded(false);setBuilding(format!=='project'&&!!scoped.document)
  if(scoped.document&&format!=='project')void evaluateSnapshot(scoped.document,controller.signal).then(result=>{if(generation.current===token){setBuiltScope(scoped.document);setMesh(result);setBuilding(false)}}).catch(e=>{if(generation.current===token&&!controller.signal.aborted){setError(e.message);setBuilding(false)}})
  return()=>{generation.current++;controller.abort()}
 },[scoped,format])
 const currentMesh=builtScope===scoped.document?mesh:null
 const layout=useMemo(()=>{try{return{result:arrange&&currentMesh&&format!=='project'?arrangeMesh(currentMesh,doc.printer.buildVolume,Number(gap),Number(margin)):null,error:''}}catch(e){return{result:null,error:(e as Error).message}}},[arrange,currentMesh,doc.printer.buildVolume,gap,margin,format])
 const outputMesh=layout.result?.mesh??currentMesh
 useEffect(()=>{setDownloaded(false)},[arrange,gap,margin])
 const settings=useMemo(()=>({arrange,gap,margin,scope,format,doc,ids}),[arrange,gap,margin,scope,format,doc,ids]),latest=useRef(settings);latest.current=settings
 const analysis=useMemo(()=>outputMesh&&scoped.document?analyzeForPrint(scoped.document,outputMesh,meshBounds(outputMesh).size):null,[outputMesh,scoped])
 const multiUnsupported=!!scoped.document&&(scoped.document.sculptStrokes.length>0||scoped.document.nodes.some(n=>!n.suppressed&&(n.boolean!=='add'||n.groupOperation==='hull'||Object.values(n.surface??{}).some(v=>v>0))))
 const allowed=format==='project'||(!placing&&!!currentMesh?.triangleCount&&!building&&!scoped.error&&!layout.error&&!(arrange&&format==='ams')&&(format!=='ams'||!multiUnsupported))
 const download=async()=>{if(!allowed||busy)return;setBusy(true);setError('');const token=generation.current,snapshot=doc,selection=ids
  try{const name=safeFilename(doc.name+(scope==='document'||format==='project'?'':`-${scope}`));let blob:Blob
   if(format==='project')blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'})
   else if(format==='ams')blob=exportMultiColor3mf(scoped.document!.nodes,doc.name)
   else if(format==='glb')blob=await exportGlb(outputMesh!)
   else blob=format==='stl'?exportStl(outputMesh!):format==='obj'?exportObj(outputMesh!):export3mf(outputMesh!,doc.name)
   if(!alive.current||latest.current!==settings||token!==generation.current||useEditor.getState().document!==snapshot||(scope==='selection'&&useEditor.getState().selectedNodeIds!==selection))throw new Error('The project or selection changed. Review the new preview before downloading.')
   downloadBlob(blob,`${name}.${format==='project'?'forge.json':format==='ams'?'3mf':format}`);setDownloaded(true)
  }catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}
 }
 return <WorkspaceDialog title="Preview and export" description={`Take “${doc.name}” to your slicer or save an editable copy.`} onClose={onClose} className="export-dialog">
 <div className="review-fields"><label>Export scope<select aria-label="Export scope" value={scope} disabled={format==='project'||busy} onChange={e=>setScope(e.target.value as typeof scope)}><option value="document">Complete model</option><option value="selection">Selected shapes and combined groups</option><option value="visible">Visible shapes and combined groups</option></select></label><label>File format<select aria-label="File format" value={format} disabled={busy} onChange={e=>setFormat(e.target.value)}>{formats.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label></div>
 <p>{formats.find(f=>f[0]===format)?.[2]}. {format==='project'?'Editable backup includes the complete project.':scope==='document'?'All enabled modeling steps, including hidden shapes, are included.':'Combined groups stay together, including hidden cutters. Ungrouped holes must be included explicitly.'}</p>
 {format!=='project'&&<><section className="export-layout"><label><input type="checkbox" checked={arrange} disabled={busy} onChange={e=>setArrange(e.target.checked)}/> Arrange disconnected solids for this export</label><p className="workflow-caption">Translation-only rows. Parts keep their orientation; your editable design stays in place. Up to 64 solids / 100,000 triangles.</p>{arrange&&<div className="review-fields"><label>Part spacing (mm)<input type="number" min="0" max="100" value={gap} disabled={busy} onChange={e=>setGap(e.target.value)}/></label><label>Bed edge margin (mm)<input type="number" min="0" max="100" value={margin} disabled={busy} onChange={e=>setMargin(e.target.value)}/></label></div>}{arrange&&format==='ams'&&<p role="alert">Choose standard 3MF, STL, OBJ or GLB for arranged geometry.</p>}{layout.error&&<p role="alert" className="workflow-error">{layout.error}</p>}{layout.result&&<p role="status">{layout.result.parts.length} solids fit the configured bed. Each lowest point is at Z = 0.</p>}</section>{building?<p role="status">Building the export preview…</p>:currentMesh?.triangleCount&&analysis?<><OverhangReview mesh={outputMesh!} threshold={doc.printer.overhangAngle}/><div className={`export-readiness ${analysis?.status}`}><div><strong>{analysis?.status==='ready'?'Basic checks passed':'Review before slicing'}</strong><p>{Object.values(analysis!.dimensions).map(v=>v.toFixed(2)).join(' × ')} mm · {outputMesh!.triangleCount.toLocaleString()} triangles</p></div></div>{analysis!.issues.map(issue=><p key={issue.id} className="workflow-caption">{issue.title}: {issue.description}</p>)}</>:!error&&!scoped.error&&<p role="status">No solid geometry in this scope.</p>}
 {scoped.document&&<details><summary>Included shapes ({scoped.document.nodes.filter(n=>!n.suppressed).length})</summary><ul>{scoped.document.nodes.filter(n=>!n.suppressed).map(n=><li key={n.id}>{n.name} · {n.boolean}{!n.visible?' · hidden in editor':''}</li>)}</ul></details>}
 {format==='ams'&&multiUnsupported&&<p className="export-warning">Choose standard 3MF to preserve holes, hulls, sculpting and surface modifiers.</p>}{placing&&<p>Finish placing your shape first.</p>}</>}
 {(error||(format!=='project'&&scoped.error))&&<p role="alert" className="workflow-error">{error||scoped.error}</p>}{downloaded&&<p role="status">Download requested. Check your browser’s downloads.</p>}
 {analysis&&format!=='project'&&!layout.error&&<button className="workflow-text-action" onClick={()=>downloadBlob(new Blob([printReport(doc,analysis,`${scope}${arrange?' · arranged on plate':''}`)],{type:'text/plain'}),`${safeFilename(doc.name)}-print-report.txt`)}>Download this scope’s print report</button>}
 <footer className="dialog-footer"><span>{format==='project'?'A separate editable copy of your work.':'Check supports, walls and layers in your slicer.'}</span><button className="studio-primary" disabled={!allowed||busy} onClick={()=>void download()}>{busy?'Preparing…':'Download file'}</button></footer>
 </WorkspaceDialog>
}
