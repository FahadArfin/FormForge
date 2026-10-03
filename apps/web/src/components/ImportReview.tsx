import { useMemo, useState } from 'react'
import { meshBounds, prepareImport, type ImportMesh } from '@/lib/importReview'
import { WorkspaceDialog } from './WorkspaceDialog'
import { MeshPreview } from './MeshPreview'
export function ImportReview({name,mesh,onClose,onConfirm}:{name:string;mesh:ImportMesh;onClose:()=>void;onConfirm:(mesh:ImportMesh)=>Promise<void>}) {
 const unitless=/\.(stl|obj)$/i.test(name),[unit,setUnit]=useState(1),[factor,setFactor]=useState('1'),[up,setUp]=useState<'y'|'z'>('z'),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const prepared=useMemo(()=>{try{const value=prepareImport(mesh,unit*Number(factor),up);return{mesh:value,bounds:meshBounds(value),error:''}}catch(e){return{mesh:null,bounds:null,error:(e as Error).message}}},[mesh,unit,factor,up])
 return <WorkspaceDialog title="Review your import" description={name} onClose={onClose} className="export-dialog">
 <p>{unitless?'This file has no units. Choose the units used when it was created.':'File units have been converted to millimeters. Geometry is imported; colors, supports and slicer settings are not retained.'}</p>
 <div className="review-fields"><label>Source units<select aria-label="Source units" value={unit} disabled={!unitless||busy} onChange={e=>setUnit(Number(e.target.value))}><option value={1}>Millimeters</option><option value={10}>Centimeters</option><option value={25.4}>Inches</option></select></label><label>Scale multiplier<input aria-label="Import scale multiplier" type="number" min="0.000001" step="any" value={factor} disabled={busy} onChange={e=>setFactor(e.target.value)}/></label><label>Up direction<select aria-label="Import up direction" value={up} disabled={busy} onChange={e=>setUp(e.target.value as 'y'|'z')}><option value="z">Z up (keep orientation)</option><option value="y">Y up → Z up</option></select></label></div>
 {prepared.mesh&&<><MeshPreview mesh={prepared.mesh} label="Imported geometry after scale and orientation"/><strong className="review-dimensions">{Object.values(prepared.bounds!.size).map(v=>v.toFixed(2)).join(' × ')} mm</strong><p>{(prepared.mesh.indices.length/3).toLocaleString()} triangles · centered on X/Y and placed at Z = 0.</p></>}
 {(prepared.error||error)&&<p role="alert" className="workflow-error">{prepared.error||error}</p>}<footer className="dialog-footer"><button className="studio-secondary" onClick={onClose}>Cancel</button><button className="studio-primary" disabled={!prepared.mesh||busy} onClick={async()=>{setBusy(true);try{await onConfirm(prepared.mesh!)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Adding…':'Add reviewed model'}</button></footer>
 </WorkspaceDialog>
}
