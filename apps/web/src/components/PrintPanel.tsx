import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, Download, LoaderCircle, Printer, RefreshCw, Settings2, Undo2, Wrench } from 'lucide-react'
import type { PrinterProfile } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { analyzeMesh } from '@/lib/meshTools'
import { getPrintReadiness, withPrinterSettings } from '@/lib/printReadiness'
import './InspectorWorkflows.css'
import { PlatePlacementPanel } from './PlatePlacementPanel'

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
  const document = useEditor((state) => state.document)
  const meshDocument = useEditor((state) => state.meshDocument)
  const geometryStatus = useEditor((state) => state.geometryStatus)
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
  const diagnostics = useMemo(() => selected?.mesh ? analyzeMesh(selected.mesh) : null, [selected?.mesh])
  const [editingPrinter, setEditingPrinter] = useState(false)
  const readiness = getPrintReadiness({ document, meshDocument, geometryStatus, geometryError, placingNodeId, analysis })
  const currentAnalysis = readiness.analysis
  const openModel = () => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'model' } }))

  return <div className="inspector-workflow print-review">
    <div className={`workflow-state ${readiness.status}`} role="status">
      {readiness.status === 'building' ? <LoaderCircle size={22} className="workflow-spinner" /> : readiness.status === 'ready' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
      <div><h2>{readiness.title}</h2><p>{readiness.message}</p></div>
    </div>
    {readiness.status === 'error' && <div className="workflow-actions"><button className="workflow-action" onClick={() => void rebuild()}><RefreshCw size={15} /> Retry build</button><button className="workflow-action secondary" disabled={!canUndo} onClick={undo}><Undo2 size={15} /> Undo edit</button></div>}
    {readiness.status === 'empty' && <button className="workflow-action secondary" onClick={openModel}>Return to modeling <ArrowRight size={15} /></button>}

    {currentAnalysis && <section className="workflow-card">
      <h3>Model size</h3>
      <dl className="print-dimensions">{(['x', 'y', 'z'] as const).map((axis) => <div key={axis}><dt>{axis.toUpperCase()}</dt><dd>{currentAnalysis.dimensions[axis].toFixed(2)} <small>mm</small></dd></div>)}</dl>
      <dl className="print-summary"><div><dt>Volume</dt><dd>{currentAnalysis.volume.toLocaleString(undefined, { maximumFractionDigits: 0 })} mm³</dd></div><div><dt>Triangles</dt><dd>{currentAnalysis.triangleCount.toLocaleString()}</dd></div></dl>
    </section>}

    <PlatePlacementPanel />
    <section className="workflow-card printer-setup">
      <div className="workflow-card-heading"><h3><Printer size={17} /> Printer setup</h3><button className="workflow-icon" aria-label={editingPrinter ? 'Close printer setup' : 'Edit printer setup'} aria-expanded={editingPrinter} onClick={() => setEditingPrinter((value) => !value)}><Settings2 size={17} /></button></div>
      {!editingPrinter && <><strong className="printer-name">{document.printer.name}</strong><p>{document.printer.buildVolume.x} × {document.printer.buildVolume.y} × {document.printer.buildVolume.z} mm build volume</p><p>Wall target: {document.printer.minimumWall} mm · Nozzle: {document.printer.nozzleDiameter} mm</p><button className="workflow-text-action" onClick={() => setEditingPrinter(true)}>Change printer setup</button></>}
      {editingPrinter && <PrinterSettings printer={document.printer} onApply={(printer) => {
        dispatch({ type: 'replace-document', document: withPrinterSettings(useEditor.getState().document, printer) })
        setEditingPrinter(false)
        setNotice('Printer setup updated. Print checks will refresh.')
      }} />}
    </section>

    {currentAnalysis && <section className="workflow-card print-findings">
      <h3>Geometry checks</h3>
      {currentAnalysis.issues.length ? <ul>{currentAnalysis.issues.map((issue) => <li className={`print-finding ${issue.severity}`} key={issue.id}><AlertCircle size={17} /><div><strong>{issue.title}</strong><p>{issue.description}</p>{issue.id === 'build-volume' && <button className="workflow-text-action" onClick={() => setEditingPrinter(true)}>Check printer dimensions</button>}</div></li>)}</ul> : <p className="workflow-passed"><CheckCircle2 size={17} /> Nonempty mesh within the configured size limits.</p>}
      <p className="workflow-caption">These checks use overall dimensions and mesh presence. They do not certify printability.</p>
    </section>}

    {diagnostics && <section className="workflow-card selected-mesh-checks">
      <h3>Selected mesh topology</h3><p className="workflow-caption">Source mesh: {selected?.name}. This checks the selected part before final modeling operations.</p>
      <dl className="print-summary"><div><dt>Boundary edges</dt><dd>{diagnostics.boundaryEdges.toLocaleString()}</dd></div><div><dt>Non-manifold edges</dt><dd>{diagnostics.nonManifoldEdges.toLocaleString()}</dd></div><div><dt>Invalid / duplicate faces</dt><dd>{(diagnostics.degenerateTriangles + diagnostics.duplicateTriangles).toLocaleString()}</dd></div></dl>
      <p className={diagnostics.watertight ? 'workflow-passed' : 'workflow-warning'}>{diagnostics.watertight ? 'No boundary or non-manifold edges detected.' : 'Open or non-manifold edges detected. Inspect this part before slicing.'}</p>
      <button className="workflow-action secondary" onClick={repairSelectedMesh}><Wrench size={15} /> Weld and clean selected mesh</button>
    </section>}

    <section className="workflow-card slicer-checklist"><h3>Finish in your slicer</h3><ol><li>Choose your printer, nozzle, and material profile.</li><li>Check local wall thickness, bed contact, orientation, and supports.</li><li>Slice and inspect the first layer and layer preview.</li></ol><p className="workflow-caption">Export contains model geometry. Printer profiles and slicing settings are configured in your slicer.</p></section>
    <button className="workflow-action primary print-handoff" disabled={!readiness.canExportMesh} onClick={() => window.dispatchEvent(new Event('formforge:open-export'))}><Download size={17} /> Choose an export format <ArrowRight size={16} /></button>
  </div>
}
