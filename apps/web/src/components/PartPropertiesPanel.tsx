import { useEffect, useRef, useState } from 'react'
import type { ModelDocument, Vec3Value } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { inspectDocumentProperties, type PropertyScope } from '@/lib/meshInspectionClient'
import type { MeshProperties } from '@/lib/meshInspection'
import { createExportDocument } from '@/lib/exportScope'
import { downloadBlob, safeFilename } from '@/lib/download'
import './InspectorWorkflows.css'
import './MeshInspectionPanels.css'

type Report = { source: ModelDocument; scope: PropertyScope; selection: string; includedNodeIds: string[]; calculatedAt: string; properties: MeshProperties }
const number = (value: number) => value !== 0 && (Math.abs(value) < .000001 || Math.abs(value) >= 1e9) ? value.toExponential(6) : Number(value.toFixed(6)).toLocaleString('en-US', { maximumFractionDigits: 6 })
const point = (value: Vec3Value) => `${number(value.x)}, ${number(value.y)}, ${number(value.z)}`

export function PartPropertiesPanel() {
  const document = useEditor(state => state.document), selectedIds = useEditor(state => state.selectedNodeIds), placing = useEditor(state => state.placingNodeId)
  const [scope, setScope] = useState<PropertyScope>('whole'), [report, setReport] = useState<Report | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const task = useRef<AbortController | null>(null), scopeRef = useRef(scope)
  scopeRef.current = scope
  const selection = scope === 'selected' ? JSON.stringify([...selectedIds].sort()) : 'whole'
  useEffect(() => {
    task.current?.abort(); task.current = null; setBusy(false); setReport(null); setError('')
    return () => { task.current?.abort(); task.current = null }
  }, [document, scope, selection, placing])
  const current = report?.source === document && report.scope === scope && report.selection === selection && !placing ? report : null
  const isCurrent = (source: ModelDocument, capturedScope: PropertyScope, capturedSelection: string) => {
    const state = useEditor.getState()
    return state.document === source && !state.placingNodeId && scopeRef.current === capturedScope && (capturedScope === 'whole' || JSON.stringify([...state.selectedNodeIds].sort()) === capturedSelection)
  }
  const calculate = async () => {
    if (task.current || placing || (scope === 'selected' && !selectedIds.length)) return
    const controller = new AbortController(), source = document, capturedScope = scope, capturedSelection = selection, ids = [...selectedIds]
    task.current = controller; setBusy(true); setError(''); setReport(null)
    try {
      const includedNodeIds = (capturedScope === 'selected' ? createExportDocument(source, ids) : source).nodes.map(node => node.id)
      const properties = await inspectDocumentProperties(source, capturedScope, ids, controller.signal)
      if (controller.signal.aborted || task.current !== controller || !isCurrent(source, capturedScope, capturedSelection)) return
      setReport({ source, scope: capturedScope, selection: capturedSelection, includedNodeIds, calculatedAt: new Date().toISOString(), properties })
    } catch (error) { if (task.current === controller && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Part properties could not be calculated.') }
    finally { if (task.current === controller) { task.current = null; setBusy(false) } }
  }
  const download = () => {
    if (!current || !isCurrent(current.source, current.scope, current.selection)) { setReport(null); return }
    const payload = {
      schemaVersion: 1,
      source: { projectId: current.source.id, name: current.source.name, revision: current.source.revision },
      scope: current.scope, includedNodeIds: current.includedNodeIds, calculatedAt: current.calculatedAt,
      units: { coordinates: 'mm', area: 'mm²', volume: 'mm³' },
      assumptions: ['Evaluated tessellated geometry in world coordinates.', 'Centroid assumes uniform density; no physical mass is estimated.', 'Self-intersections and manufacturing readiness are not checked.', 'Accuracy is limited by the evaluated mesh coordinates.'],
      properties: current.properties,
    }
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${safeFilename(current.source.name)}-${current.scope}-properties.json`)
  }
  const cancel = () => { const pending = task.current; task.current = null; pending?.abort(); setBusy(false); setReport(null) }

  return <section className="workflow-card mesh-inspection-panel" aria-label="Part properties">
    <h3>Part properties</h3>
    <p className="workflow-caption">Measure the evaluated geometry, including booleans and sculpting, independently of the viewport preview.</p>
    <label className="cad-select-label">Property scope<select value={scope} onChange={event => setScope(event.target.value as PropertyScope)}><option value="whole">Whole model</option><option value="selected">Selected complete groups</option></select></label>
    {scope === 'selected' && <p className="workflow-caption">Includes each selected complete assembly and its attached features. Free cutters are included only when selected. Volume sculpting requires the whole model or all shapes.</p>}
    {scope === 'selected' && !selectedIds.length && <p className="workflow-warning">Select a solid or complete group first.</p>}
    {placing && <p className="workflow-warning">Finish placing your shape before calculating properties.</p>}
    <p className="workflow-caption">Up to 100,000 evaluated triangles. Evaluation and inspection share a 20-second limit. Results clear when the model or scope changes.</p>
    <div className="workflow-actions"><button type="button" className="workflow-action secondary" disabled={busy || Boolean(placing) || (scope === 'selected' && !selectedIds.length)} onClick={() => void calculate()}>{busy ? 'Calculating properties…' : 'Calculate properties'}</button>{busy && <button type="button" className="workflow-action secondary" onClick={cancel}>Cancel calculation</button>}</div>
    {busy && <p role="status">Evaluating the chosen scope and measuring its surface…</p>}
    {error && <p role="alert" className="workflow-error">{error}</p>}
    {current && <>
      <p role="status" className="workflow-feedback">Properties calculated for {current.scope === 'whole' ? 'the whole model' : 'the selected complete groups'}.</p>
      <dl className="mesh-properties-list">
        <div><dt>Dimensions X × Y × Z</dt><dd>{number(current.properties.dimensions.x)} × {number(current.properties.dimensions.y)} × {number(current.properties.dimensions.z)} mm</dd></div>
        <div><dt>Surface area</dt><dd>{number(current.properties.surfaceArea)} mm²</dd></div>
        <div><dt>Geometric volume</dt><dd>{current.properties.volume === null ? 'Unknown' : `${number(current.properties.volume)} mm³`}</dd></div>
        <div><dt>Centroid X, Y, Z</dt><dd>{current.properties.centroid ? `${point(current.properties.centroid)} mm` : 'Unknown'}</dd></div>
        <div><dt>Triangles</dt><dd>{current.properties.diagnostics.inputTriangleCount.toLocaleString()}</dd></div>
      </dl>
      {current.properties.volumeReason && <p className="workflow-warning">{current.properties.volumeReason}</p>}
      <p className="workflow-caption">Centroid assumes uniform density and uses world coordinates. Tessellated surface measurements do not estimate mass, check self-intersections or establish print readiness. Accuracy depends on mesh resolution and coordinate precision.</p>
      <button type="button" className="workflow-action secondary" onClick={download}>Download JSON report</button>
    </>}
  </section>
}
