import {useEffect,useMemo,useRef,useState} from 'react'
import type {MeshPayload} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {createExportDocument,createVisibleExportDocument} from '@/lib/exportScope'
import {evaluateParts,createPartsPackage,partsManifest} from '@/lib/partsPackage'
import {downloadBlob,safeFilename} from '@/lib/download'
import {meshBounds} from '@/lib/importReview'
import {MeshPreview} from './MeshPreview'
import {WorkspaceDialog} from './WorkspaceDialog'
import './PrecisionWorkflows.css'
export function PartsPackageDialog({onClose}:{onClose:()=>void}){
 const doc=useEditor(s=>s.document),ids=useEditor(s=>s.selectedNodeIds),placing=useEditor(s=>s.placingNodeId)
 const [scope,setScope]=useState<'document'|'selection'|'visible'>('document'),[format,setFormat]=useState<'3mf'|'stl'>('3mf'),[parts,setParts]=useState<MeshPayload[]|null>(null),[active,setActive]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[retry,setRetry]=useState(0)
 const controller=useRef<AbortController|null>(null),alive=useRef(true),generation=useRef(0)
 const scoped=useMemo(()=>{try{return{document:scope==='selection'?createExportDocument(doc,ids):scope==='visible'?createVisibleExportDocument(doc):doc,error:''}}catch(e){return{document:null,error:(e as Error).message}}},[doc,ids,scope])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort()}},[])
 useEffect(()=>{controller.current?.abort();const abort=new AbortController(),token=++generation.current;controller.current=abort;setParts(null);setError(scoped.error);setActive(0)
  if(!scoped.document||placing){setStatus(placing?'Finish placing your shape first.':'');setBusy(false);return()=>abort.abort()}
  setBusy(true);setStatus('Evaluating and separating solids…')
  void evaluateParts(scoped.document,abort.signal).then(result=>{if(token===generation.current&&!abort.signal.aborted){setParts(result);setStatus(`${result.length} evaluated solid${result.length===1?'':'s'} ready to review.`)}}).catch(e=>{if(token===generation.current&&alive.current)setError((e as Error).message)}).finally(()=>{if(token===generation.current&&alive.current)setBusy(false)})
  return()=>{generation.current++;abort.abort()}
 },[scoped,placing,retry])
 async function download(){if(!parts||!scoped.document)return;const snapshot=doc,selection=ids,token=generation.current,abort=new AbortController();controller.current=abort;setBusy(true);setError('');setStatus('Packing separate models and reports…');try{const blob=await createPartsPackage(scoped.document,parts,format,scope,abort.signal);if(abort.signal.aborted||token!==generation.current||useEditor.getState().document!==snapshot||(scope==='selection'&&useEditor.getState().selectedNodeIds!==selection))throw new Error('Project or scope changed. Review the new parts before exporting.');if(alive.current){downloadBlob(blob,`${safeFilename(doc.name)}-${scope}-parts.zip`);setStatus('Download requested. Original coordinates and orientation are preserved.')}}catch(e){if(alive.current&&token===generation.current)setError((e as Error).message)}finally{if(alive.current&&token===generation.current)setBusy(false)}}
 return <WorkspaceDialog portal title="Export separate parts" description="Inspect each disconnected solid from the evaluated model, then download separate models and a parts manifest." onClose={onClose} className="precision-dialog">
 <div className="review-fields"><label>Parts scope<select aria-label="Parts scope" value={scope} disabled={busy} onChange={e=>setScope(e.target.value as typeof scope)}><option value="document">Complete model</option><option value="selection">Selected shapes and combined groups</option><option value="visible">Visible shapes and combined groups</option></select></label><label>Part format<select aria-label="Part format" value={format} disabled={busy} onChange={e=>setFormat(e.target.value as '3mf'|'stl')}><option value="3mf">3MF · units included</option><option value="stl">STL · millimeters</option></select></label></div>
 <p>{scope==='document'?'All enabled steps, including hidden shapes, are evaluated.':'Combined groups and attached holes stay together. Ungrouped holes must be selected explicitly.'} Original placement is preserved. Up to 64 solids / 100,000 triangles.</p>
 {parts&&<><label className="cad-select-label">Preview part<select aria-label="Preview part" value={active} onChange={e=>setActive(Number(e.target.value))}>{parts.map((_,i)=><option key={i} value={i}>Part {i+1}</option>)}</select></label><MeshPreview mesh={parts[active]!} label={`Evaluated part ${active+1}`}/><div className="precision-table" tabIndex={0} aria-label="Evaluated parts manifest"><table><thead><tr><th>Part</th><th>Size X × Y × Z (mm)</th><th>Volume (mm³)</th><th>Triangles</th></tr></thead><tbody>{parts.map((p,i)=><tr key={i}><th><button aria-pressed={active===i} onClick={()=>setActive(i)}>Part {i+1}</button></th><td>{Object.values(meshBounds(p).size).map(n=>n.toFixed(2)).join(' × ')}</td><td>{p.volume.toFixed(2)}</td><td>{p.triangleCount.toLocaleString()}</td></tr>)}</tbody></table></div><button onClick={()=>downloadBlob(new Blob([partsManifest(parts,scope)],{type:'text/csv;charset=utf-8'}),`${safeFilename(doc.name)}-${scope}-parts.csv`)}>Download parts CSV</button></>}
 <p>Part numbers identify this evaluated snapshot. They do not represent source shapes or materials. Volume is geometric volume, not filament use. Internal cavity shells require whole-model export.</p>
 {error&&<p role="alert" className="workflow-error">{error}</p>}{status&&<p role="status">{status}</p>}
 <footer className="dialog-footer">{busy?<button onClick={()=>controller.current?.abort()}>Cancel preparation</button>:<button onClick={()=>setRetry(r=>r+1)}>Rebuild preview</button>}<button className="studio-primary" disabled={busy||!parts||!!placing} onClick={()=>void download()}>Download parts ZIP</button></footer>
 </WorkspaceDialog>
}
