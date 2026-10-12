import { useMemo, useState } from 'react'
import type { MeshPayload, ModelDocument, Vec3Value } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { engineeringFindings, isParametricHole, type EngineeringFinding } from '@/lib/engineeringFindings'
import { rankEngineeringOrientations, type EngineeringOrientation } from '@/lib/engineeringOrientation'
import { PartPropertiesPanel } from './PartPropertiesPanel'
import { MechanicalChecksPanel } from './MechanicalChecksPanel'
import { MeshDoctorPanel } from './MeshDoctorPanel'
import { PrintPanel } from './PrintPanel'
import './InspectorWorkflows.css'
import './EngineeringInspector.css'

const evidenceLabel: Record<EngineeringFinding['evidence'],string> = {deterministic:'Geometry / design data',heuristic:'Print heuristic','unverified-ai':'Unverified · AI advice'}
const statusLabel: Record<EngineeringFinding['status'],string> = {pass:'Within target',warning:'Review',unknown:'Unknown',info:'Measured'}
const number = (value:number) => value.toLocaleString(undefined,{maximumFractionDigits:3})
type OrientationReport = {source:ModelDocument;mesh:MeshPayload;candidates:EngineeringOrientation[]}

export function EngineeringInspector({onProposeOrientation}:{onProposeOrientation?: (rotation:Vec3Value)=>void}) {
  const document=useEditor(s=>s.document),mesh=useEditor(s=>s.mesh),meshDocument=useEditor(s=>s.meshDocument)
  const status=useEditor(s=>s.geometryStatus),placing=useEditor(s=>s.placingNodeId)
  const [first,setFirst]=useState(''),[second,setSecond]=useState(''),[spacing,setSpacing]=useState(''),[tolerance,setTolerance]=useState('0.2'),[angle,setAngle]=useState('1')
  const [report,setReport]=useState<OrientationReport|null>(null),[error,setError]=useState('')
  const [expanded,setExpanded]=useState<Record<string,boolean>>({})
  const holes=useMemo(()=>document.nodes.filter(isParametricHole),[document])
  const firstId=holes.some(n=>n.id===first)?first:holes[0]?.id??'',secondId=holes.some(n=>n.id===second)?second:holes[1]?.id??''
  const currentMesh=status==='ready'&&meshDocument===document&&!placing?mesh:null
  const findings=useMemo(()=>engineeringFindings(document,currentMesh,{holeIds:[firstId,secondId],targetSpacingMm:spacing.trim()===''?undefined:Number(spacing),toleranceMm:tolerance.trim()===''?NaN:Number(tolerance),alignmentToleranceDegrees:angle.trim()===''?NaN:Number(angle)}),[document,currentMesh,firstId,secondId,spacing,tolerance,angle])
  const currentReport=report?.source===document&&report.mesh===currentMesh?report:null
  const compare=()=>{
    if(!currentMesh)return
    try{setReport({source:document,mesh:currentMesh,candidates:rankEngineeringOrientations(currentMesh,document.printer)});setError('')}
    catch(cause){setReport(null);setError(cause instanceof Error?cause.message:'Orientation comparison failed.')}
  }
  const preview=(candidate:EngineeringOrientation)=>{
    const latest=useEditor.getState()
    if(!currentReport||latest.document!==currentReport.source||latest.mesh!==currentReport.mesh||latest.meshDocument!==latest.document||latest.geometryStatus!=='ready'||latest.placingNodeId)return
    onProposeOrientation?.(candidate.rotation)
  }
  const panel=(id:string,title:string,content:React.ReactNode)=><details className="workflow-card engineering-detail" open={Boolean(expanded[id])} onToggle={event=>{const open=event.currentTarget.open;setExpanded(value=>value[id]===open?value:{...value,[id]:open})}}><summary>{title}</summary>{expanded[id]&&content}</details>
  return <div className="inspector-workflow engineering-inspector">
    <section className="workflow-card engineering-intro"><span className="engineering-eyebrow">PrintLab · engineering</span><h2>Measure before you make</h2><p>Inspect the current design, compare print orientations and keep each result tied to its evidence.</p><p className="workflow-caption">Geometry / design data is calculated. Print heuristics need slicer review. AI advice and physical performance remain unverified.</p></section>
    <section className="workflow-card"><h3>Hole targets</h3><p className="workflow-caption">Select two parametric cylinder cutters. These are nominal design features; holes are not reverse-engineered from mesh triangles.</p>
      <div className="engineering-targets">{[[firstId,setFirst,'First hole'],[secondId,setSecond,'Second hole']].map(([value,set,label])=><label key={label as string}>{label as string}<select value={value as string} onChange={event=>(set as (v:string)=>void)(event.target.value)}><option value="">Choose a hole</option>{holes.map(hole=><option value={hole.id} key={hole.id}>{hole.name}</option>)}</select></label>)}</div>
      <label>Center spacing target (mm)<input type="number" min="0" step="any" placeholder="Optional target" value={spacing} onChange={e=>setSpacing(e.target.value)}/></label>
      <div className="engineering-targets"><label>Linear tolerance (mm)<input type="number" min="0" step=".05" value={tolerance} onChange={e=>setTolerance(e.target.value)}/></label><label>Axis tolerance (°)<input type="number" min="0" max="90" step=".1" value={angle} onChange={e=>setAngle(e.target.value)}/></label></div>
    </section>
    <section className="workflow-card" aria-label="Engineering findings"><h3>Engineering findings</h3><ul className="engineering-findings">{findings.map(finding=><li key={finding.id} className={`engineering-finding ${finding.status}`}><div className="engineering-finding-heading"><strong>{finding.title}</strong><span className="engineering-status">{statusLabel[finding.status]}</span></div><span className={`engineering-evidence ${finding.evidence}`}>{evidenceLabel[finding.evidence]}</span>{finding.value!==undefined&&<b className="engineering-value">{number(finding.value)} {finding.unit==='deg'?'°':finding.unit}</b>}<p>{finding.description}</p></li>)}</ul></section>
    <section className="workflow-card" aria-label="Orientation comparison"><h3>Compare print orientations</h3><p>Six axis directions, evaluated from the current solid. Ranked by build-volume fit, larger bed contact, then less potential overhang area.</p><p className="workflow-caption">Each candidate assumes centering and dropping to the bed. Contact uses faces within 0.05 mm. Up to 100,000 triangles. Support paths, adhesion and strength are not predicted.</p>
      <button className="workflow-action secondary" disabled={!currentMesh} onClick={compare}>Compare six orientations</button>{!currentMesh&&<p className="workflow-caption">Finish placement and build the current solid to compare orientations.</p>}{error&&<p role="alert" className="workflow-error">{error}</p>}
      {currentReport&&<ol className="engineering-orientations">{currentReport.candidates.map((candidate,index)=><li key={candidate.id}><div className="engineering-finding-heading"><strong>{index+1}. {candidate.label}</strong><span className={`engineering-status ${candidate.fitsBuildVolume?'pass':'warning'}`}>{candidate.fitsBuildVolume?'Fits volume':'Exceeds volume'}</span></div><p>{number(candidate.dimensions.x)} × {number(candidate.dimensions.y)} × {number(candidate.dimensions.z)} mm</p><dl><div><dt>Bed contact</dt><dd>{number(candidate.bedContactArea)} mm²</dd></div><div><dt>Potential overhang</dt><dd>{number(candidate.overhangArea)} mm²</dd></div></dl><button className="workflow-action secondary" disabled={!onProposeOrientation} onClick={()=>preview(candidate)}>Preview orientation · {candidate.label}</button></li>)}</ol>}
    </section>
    {panel('properties','Part properties · evaluated dimensions, volume and centroid',<PartPropertiesPanel/>)}
    {panel('mechanical','Mechanical checks · wall samples, clearance and overlap',<MechanicalChecksPanel key={document.id}/>)}
    {panel('mesh','Mesh Doctor · inspect and preview cleanup',<MeshDoctorPanel/>)}
    <section className="workflow-card"><h3>Point measurements</h3><p>Pick mesh vertices or surface points in the canvas to measure distance and X/Y/Z offsets.</p><button className="workflow-action secondary" onClick={()=>{useEditor.getState().setTool('measure');useEditor.getState().setMeasurement(null)}}>Start measuring</button></section>
    {panel('print','Print review · printer setup, evidence and slicer handoff',<PrintPanel/>)}
  </div>
}
