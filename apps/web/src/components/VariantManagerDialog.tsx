import { useEffect,useRef,useState } from 'react'
import { useEditor } from '@/store/editor'
import { editParameterVariant } from '@/lib/parameterVariants'
import { createVariantPackage,variantCsv,variantTable } from '@/lib/variantPackage'
import { downloadBlob,safeFilename } from '@/lib/download'
import { WorkspaceDialog } from './WorkspaceDialog'
import './PrecisionWorkflows.css'
export function VariantManagerDialog({onClose}:{onClose:()=>void}){
 const doc=useEditor(s=>s.document),[selected,setSelected]=useState<string[]>([]),[format,setFormat]=useState<'3mf'|'stl'>('3mf'),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false)
 const controller=useRef<AbortController|null>(null),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort()}},[])
 useEffect(()=>{controller.current?.abort();setSelected(ids=>ids.filter(id=>doc.parameterVariants?.some(v=>v.id===id)))},[doc])
 const table=variantTable(doc),variants=doc.parameterVariants??[]
 function edit(id:string,name:string,replace=false){try{const state=useEditor.getState();state.dispatch({type:'replace-document',document:editParameterVariant(state.document,id,name,replace)});setError('');setStatus(replace?'Variant updated. Undo restores its previous values.':'Variant renamed.')}catch(e){setError((e as Error).message)}}
 async function build(){const snapshot=doc,abort=new AbortController();controller.current=abort;setBusy(true);setError('');setStatus('Starting…');try{const blob=await createVariantPackage(snapshot,selected,format,abort.signal,message=>{if(alive.current)setStatus(message)});if(abort.signal.aborted||useEditor.getState().document!==snapshot)throw new Error('Project changed. Build the package again.');if(alive.current){downloadBlob(blob,`${safeFilename(snapshot.name)}-variants.zip`);setStatus('Download requested. The current model was kept as it was.')}}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}}
 return <WorkspaceDialog portal title="Compare and export variants" description="Compare resolved dimensions, update a saved size, or export up to 8 complete models together." onClose={onClose} className="precision-dialog">
 <div className="precision-table" tabIndex={0} aria-label="Variant comparison"><table><thead><tr><th scope="col">Parameter</th>{table.columns.map((c,i)=><th scope="col" key={i}>{c}</th>)}</tr></thead><tbody>{table.rows.map(r=><tr key={r.id}><th scope="row">{r.name}</th>{r.values.map((v,i)=><td key={i} className={i>0&&v!==r.values[0]?'different':''}>{v}</td>)}</tr>)}</tbody></table></div>
 <p className="workflow-caption">Highlighted values differ from Current. Each value uses its parameter’s declared unit.</p>
 <button className="studio-secondary" onClick={()=>downloadBlob(new Blob([variantCsv(doc)],{type:'text/csv;charset=utf-8'}),`${safeFilename(doc.name)}-variants.csv`)}>Download comparison CSV</button>
 <div className="precision-list">{variants.map(v=><article key={v.id}><label className="precision-check"><input type="checkbox" disabled={busy||(!selected.includes(v.id)&&selected.length>=8)} checked={selected.includes(v.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,v.id]:ids.filter(id=>id!==v.id))}/>Include {v.name}</label><div className="precision-row"><input aria-label={`Rename variant ${v.name}`} maxLength={64} key={v.name} defaultValue={v.name} disabled={busy} onBlur={e=>{if(e.target.value!==v.name)edit(v.id,e.target.value)}}/><button disabled={busy} onClick={()=>edit(v.id,v.name,true)}>Update from current</button></div></article>)}</div>
 {!variants.length&&<p>Save variants in the Parameters panel to compare or export them here.</p>}
 <label className="cad-select-label">Package model format<select aria-label="Package model format" value={format} disabled={busy} onChange={e=>setFormat(e.target.value as '3mf'|'stl')}><option value="3mf">3MF · includes units</option><option value="stl">STL · millimeters</option></select></label>
 <p>Includes one model, resolved parameter list, and basic print report per variant. Up to 64 MiB per package. Check each model in your slicer.</p>
 {error&&<p role="alert" className="workflow-error">{error}</p>}{status&&<p role="status">{status}</p>}
 <footer className="dialog-footer"><span>{selected.length} of 8 variants selected</span>{busy?<button onClick={()=>controller.current?.abort()}>Cancel export</button>:<button className="studio-primary" disabled={!selected.length||!!useEditor.getState().placingNodeId} onClick={()=>void build()}>Download variants ZIP</button>}</footer>
 </WorkspaceDialog>
}
