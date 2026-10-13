import { useMemo, useState } from 'react'
import { useEditor } from '@/store/editor'
import { assemblyInventory, inventoryCsv, inventoryJson, type InventoryComponent } from '@/lib/assemblyInventory'
import { downloadBlob, safeFilename } from '@/lib/download'

export function AssemblyInventoryPanel() {
  const document = useEditor(state => state.document), selectedIds = useEditor(state => state.selectedNodeIds), placing = useEditor(state => state.placingNodeId)
  const [scope, setScope] = useState<'whole' | 'selected'>('whole'), [query, setQuery] = useState(''), [page, setPage] = useState(0)
  const selectionKey = JSON.stringify(selectedIds)
  const result = useMemo(() => {
    try { return { report: assemblyInventory(document, scope === 'selected' ? JSON.parse(selectionKey) as string[] : undefined), error: '' } }
    catch (error) { return { report: null, error: error instanceof Error ? error.message : 'Could not list these components.' } }
  }, [document, scope, selectionKey])
  const report = result.report
  const filtered = report?.components.filter(component => `${component.name} ${component.featureNames.join(' ')} ${component.materials.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? []
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20)), currentPage = Math.min(page, pageCount - 1)
  const current = () => {
    const state = useEditor.getState()
    return state.document === document && !state.placingNodeId && (scope === 'whole' || JSON.stringify(state.selectedNodeIds) === selectionKey)
  }
  const download = (format: 'csv' | 'json') => {
    if (!report?.components.length || !current()) return
    downloadBlob(new Blob([format === 'csv' ? inventoryCsv(report) : inventoryJson(report)], {type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json'}), `${safeFilename(document.name)}-assembly-inventory.${format}`)
  }
  const select = (component: InventoryComponent) => {
    if (!current()) return
    const state = useEditor.getState()
    state.setTool('select')
    state.selectNode(null)
    component.nodeIds.forEach(id => { if (!useEditor.getState().selectedNodeIds.includes(id)) state.selectNode(id, true) })
  }
  return <section className="workflow-card" aria-label="Assembly inventory">
    <h3>Assembly parts list</h3>
    <p className="workflow-caption">List editable components with their source features and assigned materials. Download a local report for planning or handoff.</p>
    <label className="cad-select-label">Inventory scope<select value={scope} onChange={event => {setScope(event.target.value as 'whole' | 'selected');setPage(0)}}><option value="whole">Whole project</option><option value="selected">Selected complete groups</option></select></label>
    {scope === 'selected' && !selectedIds.length && <p className="workflow-caption">Select a solid or assembly to list its complete group.</p>}
    {placing && <p className="workflow-warning">Finish placing the shape before selecting components or downloading a report.</p>}
    {result.error && <p role="alert" className="workflow-error">{result.error}</p>}
    {report && <>
      <p role="status" className="workflow-caption">{report.components.length} component{report.components.length === 1 ? '' : 's'} · {report.suppressedFeatures} suppressed features excluded · {report.unassignedTools} unassigned boolean tools</p>
      {report.components.length > 0 ? <>
        <label className="cad-select-label">Find a component<input type="search" value={query} onChange={event => {setQuery(event.target.value);setPage(0)}} placeholder="Name, feature or material" /></label>
        <div className="inventory-list">{filtered.slice(currentPage * 20, (currentPage + 1) * 20).map(component => <article className="inventory-component" key={component.id}>
          <h4>{component.name}</h4><p className="workflow-caption">Quantity 1 · {component.solidFeatures} solid, {component.cutFeatures} cut, {component.intersectFeatures} intersection features</p>
          <p className="workflow-caption">{component.materials.join(' · ')}</p>
          <details><summary>Source features ({component.nodeIds.length})</summary><ul>{component.featureNames.map((name,index) => <li key={component.nodeIds[index]}>{name}</li>)}</ul></details>
          <button className="workflow-action secondary" disabled={!!placing} onClick={() => select(component)}>Select component</button>
        </article>)}</div>
        {!filtered.length && <p>No components match your search.</p>}
        {pageCount > 1 && <div className="workflow-actions"><button className="workflow-action secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</button><span>Page {currentPage + 1} of {pageCount}</span><button className="workflow-action secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next page</button></div>}
      </> : <p className="workflow-caption">No active solid components in this scope.</p>}
      <details><summary>What this list means</summary>{report.warnings.map(warning => <p className="workflow-caption" key={warning}>{warning}</p>)}</details>
      <div className="workflow-actions"><button className="workflow-action secondary" disabled={!report.components.length || !!placing} onClick={() => download('csv')}>Download inventory CSV</button><button className="workflow-action secondary" disabled={!report.components.length || !!placing} onClick={() => download('json')}>Download inventory JSON</button></div>
      <p className="workflow-caption">Downloads include every component in the selected scope, including search results on other pages. Project revision {document.revision}.</p>
    </>}
  </section>
}
