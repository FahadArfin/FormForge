import {useEffect,useMemo,useRef,useState} from 'react'
import {useEditor} from '@/store/editor'
import {mechanicalCheck} from '@/lib/mechanicalChecks'
import type {MechanicalResult} from '@/geometry/mechanicalChecks.worker'
import {geometryKey} from '@/lib/annotations'
import {createExportDocument} from '@/lib/exportScope'
import {evaluateSnapshot} from '@/geometry/evaluateSnapshot'
export function MechanicalChecksPanel(){
 const doc=useEditor(s=>s.document),mesh=useEditor(s=>s.mesh),meshDoc=useEditor(s=>s.meshDocument),status=useEditor(s=>s.geometryStatus)
 const [result,setResult]=useState<{key:string;data:MechanicalResult}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),controller=useRef<AbortController|null>(null)
 const [first,setFirst]=useState(''),[second,setSecond]=useState(''),[search,setSearch]=useState('5'),[wall,setWall]=useState(String(doc.printer.minimumWall))
 const key=geometryKey(doc)
 const choices=useMemo(()=>{const groups=new Set<string>();return doc.nodes.filter(n=>{if(n.boolean!=='add'||n.suppressed)return false;const id=n.assemblyPath?.[0]??n.groupId??n.id;if(groups.has(id))return false;groups.add(id);return true})},[doc])
 useEffect(()=>{controller.current?.abort();setBusy(false);setResult(null);setError('');window.dispatchEvent(new Event('formforge:diagnostic-point'));return()=>{controller.current?.abort();window.dispatchEvent(new Event('formforge:diagnostic-point'))}},[key])
 useEffect(()=>{controller.current?.abort();setBusy(false);setResult(null)},[first,second,search,wall])
 const run=async(kind:'walls'|'interference')=>{
  controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setResult(null)
  try{
   let data:MechanicalResult
   if(kind==='walls'){if(!mesh||meshDoc!==doc||status!=='ready')throw new Error('Wait for the current solid to finish building.');data=await mechanicalCheck({kind,mesh,target:Number(wall)},abort.signal)}
   else{if(!first||!second||first===second)throw new Error('Choose two different independent parts.');if(doc.nodes.some(n=>n.boolean!=='add'&&!n.combined&&!n.assemblyPath?.length&&!n.faceAttachment&&!n.suppressed))throw new Error('Group free cutters with their target before comparing independent parts.');const a=await evaluateSnapshot(createExportDocument(doc,[first]),abort.signal),b=await evaluateSnapshot(createExportDocument(doc,[second]),abort.signal);data=await mechanicalCheck({kind,meshes:[a,b],search:Number(search)},abort.signal)}
   if(!abort.signal.aborted)setResult({key,data})
  }catch(e){if(!abort.signal.aborted)setError((e as Error).message)}finally{if(controller.current===abort)setBusy(false)}
 }
 const current=result?.key===key?result.data:null
 return <section className="workflow-card"><h3>Mechanical checks · bounded analysis</h3><p className="workflow-caption">Run on demand. Up to 100,000 triangles per mesh; each analysis stops after 20 seconds. Results clear when geometry or check settings change.</p>
  <label className="cad-select-label">Minimum wall target (mm)<input type="number" min=".01" max="100" step=".1" value={wall} onChange={e=>setWall(e.target.value)}/></label><button className="workflow-action secondary" disabled={busy||status!=='ready'||meshDoc!==doc} onClick={()=>void run('walls')}>Sample wall distances</button>
  <details><summary>Compare two independent parts</summary>{[[first,setFirst,'First part'],[second,setSecond,'Second part']].map(([value,set,label])=><label className="cad-select-label" key={label as string}>{label as string}<select value={value as string} onChange={e=>(set as (v:string)=>void)(e.target.value)}><option value="">Choose part</option>{choices.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>)}<label className="cad-select-label">Clearance search distance (mm)<input type="number" min=".01" max="100" value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="workflow-action secondary" disabled={busy} onClick={()=>void run('interference')}>Check overlap and clearance</button></details>
  {busy&&<p role="status">Checking geometry… <button onClick={()=>{controller.current?.abort();setBusy(false)}}>Cancel check</button></p>}{error&&<p role="alert" className="workflow-error">{error}</p>}
  {current?.kind==='walls'&&<div role="status"><p><strong>{current.thin.length?'Needs review: thin samples found':current.accepted===current.sampled?'No thin samples found':'Partial result: some rays could not be measured'}</strong></p><p>Minimum sampled distance: {current.minimum?.toFixed(3)??'unknown'} mm. {current.accepted}/{current.sampled} rays measured across {current.components} connected components; {current.totalFaces} total faces.</p><p className="workflow-caption">Triangle-centroid samples, capped at 512, do not establish the global minimum wall thickness. Small features and angled walls can be missed; verify toolpaths in your slicer.</p>{!!current.thin.length&&<details><summary>Locate thin samples ({current.thin.length}, capped at 64)</summary><ol>{current.thin.map((s,i)=><li key={i}><button className="workflow-text-action" onClick={()=>window.dispatchEvent(new CustomEvent('formforge:diagnostic-point',{detail:{point:s.point}}))}>{s.thickness.toFixed(3)} mm at {s.point.map(v=>v.toFixed(2)).join(', ')}</button></li>)}</ol><p>Click a sample to show its red marker on the model.</p></details>}</div>}
  {current?.kind==='interference'&&<div role="status"><strong>{current.overlapVolume>1e-6?'Material overlap detected':current.gap<.0001?'Contact or clearance below 0.0001 mm':'Parts are separated'}</strong><p>Overlap volume: {current.overlapVolume.toFixed(4)} mm³. Clearance: {current.gap>=current.search?'at least ':''}{current.gap.toFixed(3)} mm.</p><p className="workflow-caption">Evaluated mesh geometry of the chosen two parts. Fit, deformation and manufacturing tolerances are not included.</p></div>}
 </section>
}
