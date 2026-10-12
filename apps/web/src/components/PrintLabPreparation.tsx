import {useEffect,useRef,useState} from 'react'
import {parseModelDocument,type ModelDocument,type PrinterProfile} from '@formforge/model'
import {useEditor} from '@/store/editor'
import {associateSlicerResult,checkBedExclusions,importSlicerFile,materialPresets,printerPresets,printJobFingerprint,slicerMaterialCost,type SlicerCandidate} from '@/lib/printlabPrinting'
import {downloadBlob,safeFilename} from '@/lib/download'

type Exclusion=NonNullable<PrinterProfile['usableBedExclusions']>[number]
const durationLabel=(seconds:number|undefined)=>seconds===undefined?'Unknown':`${Number((seconds/60).toFixed(2))} min`
function ResultDetails({result}:{result:SlicerCandidate}){
 return <><p><strong>{result.fileName}</strong>{result.plate&&<> · {result.plate}</>}</p><dl className="print-summary"><div><dt>Slicer</dt><dd>{result.slicer==='unknown'?'Unknown':result.slicer} · {result.slicerVersion??'version unknown'}</dd></div><div><dt>Slicer time estimate</dt><dd>{durationLabel(result.durationSeconds)}</dd></div><div><dt>Slicer filament mass</dt><dd>{result.filamentGrams===undefined?'Unknown':`${result.filamentGrams} g`}</dd></div></dl><p className="workflow-caption">Time source: {result.durationSource??'Unknown'}<br/>Mass source: {result.massSource??'Unknown'}<br/>Imported: {result.importedAt}</p></>
}
export function PrintLabPreparation(){
 const doc=useEditor(s=>s.document),mesh=useEditor(s=>s.mesh),meshDoc=useEditor(s=>s.meshDocument),status=useEditor(s=>s.geometryStatus)
 const [printer,setPrinter]=useState<keyof typeof printerPresets>('P1S'),[material,setMaterial]=useState<keyof typeof materialPresets>('PLA')
 const [areas,setAreas]=useState<Exclusion[]>(doc.printer.usableBedExclusions??[])
 const [candidates,setCandidates]=useState<SlicerCandidate[]>([]),[selected,setSelected]=useState(0),[confirmed,setConfirmed]=useState(false),[importKey,setImportKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const request=useRef(0),fingerprint=printJobFingerprint(doc),candidate=candidates[selected],result=doc.slicerResult
 useEffect(()=>{setAreas(doc.printer.usableBedExclusions??[])},[doc.printer])
 useEffect(()=>{setConfirmed(false)},[fingerprint,selected])
 useEffect(()=>()=>{request.current++},[])
 const perform=(action:()=>void)=>{try{action();setError('')}catch(cause){setError(cause instanceof Error?cause.message:'Check these print settings.')}}
 const save=(patch:Partial<ModelDocument>,notice:string)=>perform(()=>{
  const state=useEditor.getState(),next={...state.document,...patch,revision:state.document.revision+1,updatedAt:new Date().toISOString()}
  parseModelDocument(next)
  state.dispatch({type:'replace-document',document:next});state.setNotice(notice)
 })
 const overlaps=mesh&&meshDoc===doc&&status==='ready'?checkBedExclusions(mesh.positions,doc.printer):null
 const stale=!!result&&result.jobFingerprint!==fingerprint,cost=slicerMaterialCost(doc),pendingChanged=!!candidate&&importKey!==fingerprint
 const updateArea=(index:number,patch:Partial<Exclusion>)=>setAreas(current=>current.map((area,i)=>i===index?{...area,...patch}:area))
 return <section className="workflow-card printlab-preparation" aria-label="PrintLab preparation">
  <h3>PrintLab · prepare and verify</h3>
  <p>Use a printer and material reference, then bring back the estimates from your slicer.</p>
  <div className="size-fields"><label className="cad-select-label">Printer preset<select aria-label="PrintLab printer preset" value={printer} onChange={e=>setPrinter(e.target.value as keyof typeof printerPresets)}><option value="P1S">Bambu Lab P1S · nominal 256³ mm</option><option value="custom">Custom printer · 220 × 220 × 250 mm</option></select></label><button className="workflow-action secondary" onClick={()=>save({printer:structuredClone(printerPresets[printer])},'Printer preset applied. Review operational limits in your slicer.')}>Apply printer preset</button></div>
  <p className="workflow-caption">Edit the printer name, volume and nozzle in Printer setup above. The P1S nominal volume is 256 × 256 × 256 mm; slicer height, toolhead and accessory restrictions still apply. <a href="https://cdn1.bambulab.com/documentation/quick-start-2024-01-17/Quick-Start-P1S_en.pdf" target="_blank" rel="noreferrer">Printer specifications</a></p>
  <details><summary>Usable-bed exclusions ({doc.printer.usableBedExclusions?.length??0})</summary>
   <p>Rectangles use millimeters from the lower-left bed corner. P1S starts with an 18 × 28 mm cutter clearance. Match the exclusions in your active slicer profile.</p>
   <form onSubmit={e=>{e.preventDefault();save({printer:{...useEditor.getState().document.printer,usableBedExclusions:areas}},'Usable-bed exclusions saved.')}}>
    {areas.map((area,index)=><fieldset key={index}><legend>Exclusion {index+1}</legend><label className="cad-select-label">Reason<input maxLength={120} value={area.reason} onChange={e=>updateArea(index,{reason:e.target.value})}/></label><div className="size-fields">{(['x','y','width','depth'] as const).map(field=><label key={field} className="cad-select-label">{field}<input aria-label={`Exclusion ${index+1} ${field}`} type="number" required min={field==='x'||field==='y'?0:.01} step="any" value={Number.isFinite(area[field])?area[field]:''} onChange={e=>updateArea(index,{[field]:e.target.value===''?NaN:Number(e.target.value)})}/></label>)}</div><button className="workflow-text-action" type="button" onClick={()=>setAreas(current=>current.filter((_,i)=>i!==index))}>Remove exclusion {index+1}</button></fieldset>)}
    <div className="workflow-actions"><button className="workflow-action secondary" type="button" disabled={areas.length>=8} onClick={()=>setAreas(current=>[...current,{x:0,y:0,width:10,depth:10,reason:'Accessory clearance'}])}>Add exclusion</button><button className="workflow-action" type="submit">Save exclusions</button></div>
   </form>
  </details>
  {(doc.printer.usableBedExclusions?.length??0)>0&&<p role="status">{overlaps===null?'Build the current model to check bed exclusions.':overlaps.length?`Review bed clearance: the model bounds overlap ${overlaps.map(a=>a.reason).join(', ')}. This is a conservative bounding-box check.`:'The current model bounds avoid the configured bed exclusions.'}</p>}
  <div className="size-fields"><label className="cad-select-label">Material preset<select aria-label="PrintLab material preset" value={material} onChange={e=>setMaterial(e.target.value as keyof typeof materialPresets)}>{Object.keys(materialPresets).map(name=><option key={name}>{name}</option>)}</select></label><button className="workflow-action secondary" onClick={()=>save({printMaterial:{...materialPresets[material]}},'Material preset applied. Enter supplier density and your price in Material and cost.')}>Apply material preset</button></div>
  <p className="workflow-caption">Current material: {doc.printMaterial?.name??'Not configured'}. Preset densities are editable assumptions. Open “Optional · material, cost and saved setups” below to edit density, name and your price. Presets never supply a price.</p>
  <hr/>
  <h4>Import slicer estimates</h4>
  <p>Slice in Bambu Studio, OrcaSlicer or PrusaSlicer. Import text G-code or a sliced 3MF/ZIP containing G-code. Choose the matching plate if there is more than one.</p>
  <label className="cad-select-label">Sliced file<input type="file" accept=".gcode,.3mf,.zip" disabled={busy} onChange={async e=>{
   const file=e.target.files?.[0];e.target.value='';if(!file)return
   const token=++request.current,key=printJobFingerprint(useEditor.getState().document);setBusy(true);setError('');setCandidates([]);setConfirmed(false)
   try{const imported=await importSlicerFile(file);if(token!==request.current)return;setCandidates(imported);setSelected(0);setImportKey(key)}catch(cause){if(token===request.current)setError(cause instanceof Error?cause.message:'Could not read this sliced file.')}finally{if(token===request.current)setBusy(false)}
  }}/></label>
  <p className="workflow-caption">Up to 32 MB input, 32 MB per text entry, 64 MB expanded text and 128 archive entries. Binary G-code is not supported. Commands are never sent to a printer.</p>
  {busy&&<p role="status">Reading slicer metadata…</p>}
  {candidate&&<div className="workflow-card">
   <h4>Review imported plate</h4>
   {candidates.length>1&&<label className="cad-select-label">Plate<select aria-label="Imported slicer plate" value={selected} onChange={e=>{setSelected(Number(e.target.value));setConfirmed(false)}}>{candidates.map((item,index)=><option key={index} value={index}>{item.plate??item.fileName}</option>)}</select></label>}
   <ResultDetails result={candidate}/>
   {pendingChanged?<p role="alert">This print job changed after file selection. Import again after exporting and slicing the current model.</p>:<label><input type="checkbox" aria-label="Confirm slicer job association" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this plate was sliced from the current geometry and orientation using this printer and material.</label>}
   <p className="workflow-caption">PrintLab cannot verify model identity from slicer comments. This link records your confirmation.</p>
   <button className="workflow-action" disabled={!confirmed||pendingChanged||busy} onClick={()=>perform(()=>{
    const state=useEditor.getState();if(printJobFingerprint(state.document)!==importKey)throw new Error('The print job changed. Import again for the current model.')
    state.dispatch({type:'replace-document',document:associateSlicerResult(state.document,candidate,confirmed)});setCandidates([]);setConfirmed(false);state.setNotice('Slicer estimates associated with this print job.')
   })}>Associate with this print job</button>
  </div>}
  {result&&<div className="workflow-card"><h4>Saved slicer result</h4><p role="status">{stale?'Stale — geometry, orientation, printer or material changed. Slice again and import a fresh result.':'Associated with this print job by your confirmation.'}</p><ResultDetails result={result}/><dl className="print-summary"><div><dt>Material cost from slicer mass</dt><dd>{stale?'Unavailable — stale result':cost===null?(result.filamentGrams===undefined?'Unknown — slicer mass unavailable':'Unknown — enter your material price'):`${doc.printMaterial!.currency} ${cost.toFixed(2)}`}</dd></div></dl><p className="workflow-caption">Slicer estimates are not measured print results. Cost covers reported filament mass at your price; it excludes energy, labor and other expenses. Missing time or mass stays unknown.</p><div className="workflow-actions"><button className="workflow-action secondary" onClick={()=>downloadBlob(new Blob([JSON.stringify({project:doc.name,printer:doc.printer,material:doc.printMaterial,result,freshness:stale?'stale':'user-confirmed current job',materialCost:cost},null,2)],{type:'application/json'}),`${safeFilename(doc.name)}-slicer-report.json`)}>Download slicer report</button><button className="workflow-text-action" onClick={()=>save({slicerResult:undefined},'Slicer association removed.')}>Remove slicer association</button></div></div>}
  {error&&<p className="workflow-error" role="alert">{error}</p>}
 </section>
}
