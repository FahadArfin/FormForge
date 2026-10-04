import {checksKey} from '@/lib/workflowProgress'
import {PrintEvidencePanel} from './PrintEvidencePanel'
import {MechanicalChecksPanel} from './MechanicalChecksPanel'
import {geometryKey} from '@/lib/annotations'
import { printReport } from '@/lib/printReport'
import { downloadBlob,safeFilename } from '@/lib/download'
import { MaterialProfilesPanel } from './MaterialProfilesPanel'
import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, Download, LoaderCircle, Printer, RefreshCw, Settings2, Undo2, Wrench } from 'lucide-react'
import type { PrinterProfile } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { getPrintReadiness, withPrinterSettings } from '@/lib/printReadiness'
import './InspectorWorkflows.css'
import { PlatePlacementPanel } from './PlatePlacementPanel'
import {OverhangReview} from './OverhangReview'
import {FitCalibrationPanel} from './FitCalibrationPanel'
import {useInspection} from '@/store/inspection'
import {NumberInput} from './NumberInput'

function PrinterSettings({ printer, onApply }: { printer: PrinterProfile; onApply: (printer: PrinterProfile) => void }) {
  const toDraft = (value: PrinterProfile) => ({ name: value.name, x: String(value.buildVolume.x), y: String(value.buildVolume.y), z: String(value.buildVolume.z), nozzle: String(value.nozzleDiameter), wall: String(value.minimumWall) })
  const [draft, setDraft] = useState(() => toDraft(printer))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft(toDraft(printer)); setError(null) }, [printer])
  const field = (key: 'x' | 'y' | 'z' | 'nozzle' | 'wall', label: string) => <label key={key}><span>{label} <small>mm</small></span><input type="number" required min="0.001" step="any" inputMode="decimal" value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))} /></label>
  return <form className="printer-settings" onSubmit={(event) => {
    event.preventDefault()
    try {
      onApply({ ...printer, name: draft.name, buildVolume: { x: Number(draft.x), y: Number(draft.y), z: Number(draft.z) }, nozzleDiameter: Number(draft.nozzle), minimumWall: Number(draft.wall) })
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check your printer settings.') }
  }}>
    <label><span>Printer name</span><input value={draft.name} maxLength={100} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
    <fieldset><legend>Build volume</legend><div className="printer-dimensions">{field('x', 'Width X')}{field('y', 'Depth Y')}{field('z', 'Height Z')}</div></fieldset>
    <div className="printer-targets">{field('nozzle', 'Nozzle diameter')}{field('wall', 'Wall target')}</div>
    <p>Nozzle and wall values are saved as references. Local wall thickness, nozzle paths, and supports are checked in your slicer.</p>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    <button className="workflow-action" type="submit">Apply printer setup</button>
  </form>
}

export function PrintPanel() {
  const mesh=useEditor(s=>s.mesh),overhangs=useInspection(s=>s.overhangs)
  const document = useEditor((state) => state.document)
  const meshDocument = useEditor((state) => state.meshDocument)
  const geometryStatus = useEditor((state) => state.geometryStatus)
  const buildMode = useEditor((state) => state.buildMode)
  const geometryError = useEditor((state) => state.geometryError)
  const placingNodeId = useEditor((state) => state.placingNodeId)
  const analysis = useEditor((state) => state.analysis)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const repairSelectedMesh = useEditor((state) => state.repairSelectedMesh)
  const rebuild = useEditor((state) => state.rebuild)
  const undo = useEditor((state) => state.undo)
  const canUndo = useEditor((state) => state.undoStack.length > 0)
  const dispatch = useEditor((state) => state.dispatch)
  const setNotice = useEditor((state) => state.setNotice)
  const selected = document.nodes.find((node) => node.id === selectedNodeId)
  const [editingPrinter, setEditingPrinter] = useState(false)
  const readiness = getPrintReadiness({ document, meshDocument, geometryStatus, geometryError, placingNodeId, analysis, buildMode })
  const currentAnalysis = readiness.analysis
  const openModel = () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'model' } }))

  return <div className="inspector-workflow print-review">
    <section className="workflow-card printer-setup">
      <div className="workflow-card-heading"><h3><Printer size={17} /> 1. Printer setup</h3><button className="workflow-icon" aria-label={editingPrinter ? 'Close printer setup' : 'Edit printer setup'} aria-expanded={editingPrinter} onClick={() => setEditingPrinter((value) => !value)}><Settings2 size={17} /></button></div>
      {!editingPrinter && <><strong className="printer-name">{document.printer.name}</strong><p>{document.printer.buildVolume.x} × {document.printer.buildVolume.y} × {document.printer.buildVolume.z} mm build volume</p><p>Wall target: {document.printer.minimumWall} mm · Nozzle: {document.printer.nozzleDiameter} mm</p><button className="workflow-text-action" onClick={() => setEditingPrinter(true)}>Change printer setup</button></>}
      {editingPrinter && <PrinterSettings printer={document.printer} onApply={(printer) => {
        dispatch({ type: 'replace-document', document: withPrinterSettings(useEditor.getState().document, printer) })
        setEditingPrinter(false)
        setNotice('Printer setup updated. Print checks will refresh.')
      }} />}
    </section>
    <PlatePlacementPanel />
    <div className={`workflow-state ${readiness.status}`} role="status">
      {readiness.status === 'building' ? <LoaderCircle size={22} className="workflow-spinner" /> : readiness.status === 'ready' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
      <div><h2>{readiness.title}</h2><p>{readiness.message}</p></div>
    </div>
    {readiness.status === 'error' && <div className="workflow-actions"><button className="workflow-action" onClick={() => void rebuild()}><RefreshCw size={15} /> Retry build</button><button className="workflow-action secondary" disabled={!canUndo} onClick={undo}><Undo2 size={15} /> Undo edit</button></div>}
    {readiness.status === 'empty' && <button className="workflow-action secondary" onClick={openModel}>Return to modeling <ArrowRight size={15} /></button>}
    {readiness.status === 'stale' && <button className="workflow-action" onClick={() => void rebuild()}><RefreshCw size={15} /> Rebuild for current checks</button>}

    {currentAnalysis && <section className="workflow-card">
      <h3>Current solid · dimensions</h3>
      <dl className="print-dimensions">{(['x', 'y', 'z'] as const).map((axis) => <div key={axis}><dt>{axis.toUpperCase()}</dt><dd>{currentAnalysis.dimensions[axis].toFixed(2)} <small>mm</small></dd></div>)}</dl>
      <dl className="print-summary"><div><dt>Volume</dt><dd>{currentAnalysis.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} mm³</dd></div><div><dt>Triangles</dt><dd>{currentAnalysis.triangleCount.toLocaleString()}</dd></div></dl>
    </section>}

    {currentAnalysis&&<button className="workflow-action secondary" onClick={()=>downloadBlob(new Blob([printReport(document,currentAnalysis)],{type:'text/plain'}),`${safeFilename(document.name)}-print-report.txt`)}>Download print report</button>}
    <details className="workflow-card"><summary>Optional · material, cost and saved setups</summary><MaterialProfilesPanel key={`material-${document.id}`}/></details>
    <section className="workflow-card"><h3>Overhang guidance</h3><NumberInput label="Warn for slopes below" accessibleLabel="Overhang threshold, degrees from bed" suffix="°" min={0} max={90} step={1} value={document.printer.overhangAngle} onChange={angle=>dispatch({type:'replace-document',document:withPrinterSettings(useEditor.getState().document,{...useEditor.getState().document.printer,overhangAngle:angle})})}/><p className="workflow-caption">Downward slopes are measured from the horizontal build plate.</p><label><input type="checkbox" checked={overhangs} onChange={e=>{useInspection.setState({overhangs:e.target.checked});if(e.target.checked)useEditor.getState().setShowResult(true)}}/> Highlight potential overhangs in the studio</label>{currentAnalysis&&mesh?<OverhangReview mesh={mesh} threshold={document.printer.overhangAngle}/>:<p>Build a current solid to review its slopes.</p>}</section>
    <details className="workflow-card"><summary>Optional · fit calibration</summary><FitCalibrationPanel key={`fit-${document.id}`}/></details>


    {currentAnalysis && <section className="workflow-card print-findings">
      <h3>3. Review the checks</h3><ul className="check-scope-list"><li><strong>Checked:</strong> solid presence, overall size and bed position.</li><li><strong>Needs review:</strong> overhangs, orientation and the fit of mating parts.</li><li><strong>Not evaluated:</strong> strength, material behavior, printer toolpaths and physical fit.</li></ul>
      {currentAnalysis.issues.length ? <ul>{currentAnalysis.issues.map((issue) => <li className={`print-finding ${issue.severity}`} key={issue.id}><AlertCircle size={17} /><div><strong>{issue.title}</strong><p>{issue.description}</p>{['bed-position','floating','below-bed'].includes(issue.id)&&<button className="workflow-text-action" onClick={()=>void useEditor.getState().placeOnPlate('document','center-and-drop')}>Center and drop model</button>}{issue.id === 'build-volume' && <button className="workflow-text-action" onClick={() => setEditingPrinter(true)}>Check printer dimensions</button>}</div></li>)}</ul> : <p className="workflow-passed"><CheckCircle2 size={17} /> Nonempty mesh within the configured size limits.</p>}
      <p className="workflow-caption">These checks use overall dimensions, bed position and mesh presence. They do not certify printability.</p>
    </section>}

    {selected?.mesh && <section className="workflow-card selected-mesh-checks">
      <h3>Inspect the selected mesh</h3><p>Check {selected.name} for open edges, inconsistent winding, and duplicate faces. Mesh Doctor previews cleanup before applying it.</p>
      <button className="workflow-action secondary" onClick={repairSelectedMesh}><Wrench size={15} /> Preview cleanup in Mesh Doctor</button>
    </section>}

    <PrintEvidencePanel key={`evidence-${document.id}`}/>
    <MechanicalChecksPanel key={document.id}/>
    <section className="workflow-card slicer-checklist"><h3>Finish in your slicer</h3><ol><li>Choose your printer, nozzle, and material profile.</li><li>Check local wall thickness, bed contact, orientation, and supports.</li><li>Slice and inspect the first layer and layer preview.</li></ol><p className="workflow-caption">Export contains model geometry. Printer profiles and slicing settings are configured in your slicer.</p></section>
    <button className="workflow-action secondary" disabled={!currentAnalysis} onClick={()=>{window.dispatchEvent(new CustomEvent('formforge:workflow',{detail:{action:'checked',documentId:document.id,key:checksKey(document)}}));setNotice('Checks reviewed for this geometry. Continue with 3MF export.')}}>I have reviewed these checks</button>
    <button className="workflow-action primary print-handoff" disabled={!readiness.canExportMesh} onClick={() => window.dispatchEvent(new Event('formforge:open-export'))}><Download size={17} /> Export for slicing · 3MF <ArrowRight size={16} /></button>
  </div>
}
