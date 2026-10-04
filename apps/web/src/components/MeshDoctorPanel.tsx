import { useEffect, useRef, useState } from 'react'
import type { ModelDocument, ModelNode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { inspectSourceMesh, type MeshDoctorResult } from '@/lib/meshInspectionClient'
import { validateInspectionMesh } from '@/lib/meshInspection'
import { MeshPreview } from './MeshPreview'
import './InspectorWorkflows.css'
import './MeshInspectionPanels.css'

type Preview = { source: ModelDocument; node: ModelNode; signature: string; selection: string; data: MeshDoctorResult; changed: boolean }

export function MeshDoctorPanel() {
  const document = useEditor(state => state.document), selectedIds = useEditor(state => state.selectedNodeIds), selectedId = useEditor(state => state.selectedNodeId), placing = useEditor(state => state.placingNodeId)
  const selection = JSON.stringify([selectedId, selectedIds])
  const node = selectedIds.length === 1 ? document.nodes.find(candidate => candidate.id === selectedId && candidate.id === selectedIds[0]) : undefined
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const task = useRef<AbortController | null>(null)
  useEffect(() => {
    task.current?.abort(); task.current = null; setBusy(false); setPreview(null); setError('')
    return () => { task.current?.abort(); task.current = null }
  }, [document, selection, placing])
  const current = preview?.source === document && preview.selection === selection ? preview : null

  const inspect = async () => {
    if (task.current || !node?.mesh || placing) return
    const controller = new AbortController(), source = document
    task.current = controller; setBusy(true); setError(''); setPreview(null)
    try {
      validateInspectionMesh(node.mesh, true)
      const signature = JSON.stringify(node.mesh)
      const data = await inspectSourceMesh(node.mesh, controller.signal)
      const latest = useEditor.getState()
      if (controller.signal.aborted || task.current !== controller || latest.document !== source || JSON.stringify([latest.selectedNodeId, latest.selectedNodeIds]) !== selection || latest.placingNodeId || JSON.stringify(node.mesh) !== signature) return
      setPreview({ source, node, signature, selection, data, changed: JSON.stringify(data.mesh) !== signature })
    } catch (error) { if (task.current === controller && !controller.signal.aborted) setError(error instanceof Error ? error.message : 'Mesh inspection failed.') }
    finally { if (task.current === controller) { task.current = null; setBusy(false) } }
  }
  const apply = () => {
    if (!current) return
    const state = useEditor.getState(), latest = state.document.nodes.find(candidate => candidate.id === current.node.id)
    if (state.document !== current.source || latest !== current.node || latest.locked || state.placingNodeId || JSON.stringify([state.selectedNodeId,state.selectedNodeIds]) !== current.selection || JSON.stringify(latest.mesh) !== current.signature) {
      setPreview(null); setError('The source, selection or lock changed. Inspect the current unlocked mesh again.'); return
    }
    if (!current.changed || !current.data.mesh.indices.length) return
    state.updateNode(latest.id, { mesh: current.data.mesh })
    if (useEditor.getState().document.nodes.find(candidate => candidate.id === latest.id)?.mesh !== current.data.mesh) {
      setError('Cleanup could not be applied. Your source mesh is unchanged.'); return
    }
    setPreview(null)
    useEditor.getState().setNotice('Mesh cleanup applied. Undo restores the original source mesh and sculpt masks.')
  }
  const cancel = () => { const pending = task.current; task.current = null; pending?.abort(); setBusy(false); setPreview(null) }
  const rows = current ? [
    ['Vertices', current.data.before.inputVertexCount, current.data.after.inputVertexCount],
    ['Triangles', current.data.before.inputTriangleCount, current.data.after.inputTriangleCount],
    ['Invalid faces', current.data.before.invalidTriangles, current.data.after.invalidTriangles],
    ['Degenerate faces', current.data.before.degenerateTriangles, current.data.after.degenerateTriangles],
    ['Duplicate faces', current.data.before.duplicateTriangles, current.data.after.duplicateTriangles],
    ['Boundary edges', current.data.before.boundaryEdges, current.data.after.boundaryEdges],
    ['Non-manifold edges', current.data.before.nonManifoldEdges, current.data.after.nonManifoldEdges],
    ['Winding conflicts', current.data.before.windingConflicts, current.data.after.windingConflicts],
  ] : []

  return <section className="workflow-card mesh-inspection-panel" aria-label="Mesh Doctor">
    <h3>Mesh Doctor</h3>
    <p className="workflow-caption">Inspect one imported or converted mesh. Preview cleanup before applying; your source stays editable until Apply.</p>
    {!node?.mesh && <p className="workflow-caption">Select one mesh shape to inspect. Primitive shapes can be checked with Part properties.</p>}
    {node?.mesh && <p className="mesh-inspection-source">{node.name}</p>}
    {node?.locked && <p className="workflow-warning">Inspection is available. Unlock this shape before applying cleanup.</p>}
    {placing && <p className="workflow-warning">Finish placing your shape before inspection.</p>}
    <p className="workflow-caption">Up to 100,000 triangles; stops after 20 seconds. Runs locally on demand.</p>
    <div className="workflow-actions"><button type="button" className="workflow-action secondary" disabled={busy || !node?.mesh || Boolean(placing)} onClick={() => void inspect()}>{busy ? 'Inspecting mesh…' : 'Inspect mesh'}</button>{busy && <button type="button" className="workflow-action secondary" onClick={cancel}>Cancel inspection</button>}</div>
    {busy && <p role="status">Checking topology and preparing cleanup…</p>}
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {current && <>
      <div className="mesh-inspection-table"><table><caption>Cleanup preview · source coordinates</caption><thead><tr><th scope="col">Check</th><th scope="col">Before</th><th scope="col">After</th></tr></thead><tbody>{rows.map(([label,before,after]) => <tr key={label}><th scope="row">{label}</th><td>{before}</td><td>{after}</td></tr>)}</tbody></table></div>
      <p role="status" className={current.data.after.watertight ? 'workflow-feedback' : 'workflow-warning'}>{current.data.after.watertight ? 'Closed edges with consistent face winding after cleanup.' : 'Open or inconsistent topology remains after cleanup. Review the counts above.'}</p>
      {current.data.mesh.indices.length > 0 ? <MeshPreview mesh={current.data.mesh} label="Cleaned mesh preview in source coordinates" /> : <p className="workflow-warning">Cleanup would leave no usable faces. It cannot be applied.</p>}
      <p className="workflow-caption">Welds positions on a 0.00001 mm grid and removes invalid, duplicate and degenerate faces. The strongest sculpt mask is kept at each welded vertex; retained faces keep their materials.</p>
      <p className="workflow-caption">Does not fill holes, fix self-intersections, reverse faces or infer cavity orientation. Closed edge counts do not establish print readiness.</p>
      <button type="button" className="workflow-action" disabled={Boolean(node?.locked) || !current.changed || !current.data.mesh.indices.length} onClick={apply}>Apply cleanup</button>
      {!current.changed && <p className="workflow-caption">No cleanup changes were found.</p>}
      <p className="workflow-caption">Apply is one Undo step. Save a checkpoint to keep a lasting recovery copy.</p>
    </>}
  </section>
}
