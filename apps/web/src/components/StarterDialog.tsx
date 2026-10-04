import { useEffect, useMemo, useState } from 'react'
import type { MeshPayload, ModelDocument } from '@formforge/model'
import { createStarter } from '@/lib/starters'
import { findTemplates, templateCatalog, type StarterId } from '@/lib/templateCatalog'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { MeshPreview } from './MeshPreview'
import { WorkspaceDialog } from './WorkspaceDialog'

export function StarterDialog({ initialId = 'enclosure', onClose, onCreate }: {
  initialId?: StarterId; onClose: () => void; onCreate: (doc: ModelDocument) => Promise<void>
}) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('All')
  const [id, setId] = useState(initialId), [mesh, setMesh] = useState<MeshPayload | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  const doc = useMemo(() => createStarter(id), [id]), item = templateCatalog.find(s => s.id === id)!
  const matches = findTemplates(query, category)
  useEffect(() => {
    const controller = new AbortController()
    setMesh(null); setError('')
    void evaluateSnapshot(doc, controller.signal).then(result => { if (!controller.signal.aborted) setMesh(result) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Preview unavailable. Please retry.') })
    return () => controller.abort()
  }, [doc, attempt])
  return <WorkspaceDialog title="Start with a useful part" description="Real editable geometry. Make a copy, adjust it, then check it in your slicer." onClose={onClose} className="export-dialog">
    <div className="template-filters"><label className="cad-select-label">Find a template<input data-initial-focus type="search" value={query} placeholder="Enclosure, bracket, fit…" onChange={e => setQuery(e.target.value)} /></label>
      <label className="cad-select-label">Category<select value={category} onChange={e => setCategory(e.target.value)}>{['All', ...new Set(templateCatalog.map(s => s.category))].map(c => <option key={c}>{c}</option>)}</select></label></div>
    <div className="starter-grid">{matches.map(s => <button key={s.id} aria-pressed={id === s.id} disabled={busy} onClick={() => setId(s.id)}><strong>{s.name}</strong><span>{s.description}</span></button>)}</div>
    {!matches.length && <p role="status">No templates match. Clear your search or choose another category.</p>}
    <h3>{item.name}</h3><p>{item.dimensions} · {item.level}</p>
    {mesh ? <MeshPreview mesh={mesh} label={item.name + ' evaluated geometry'} /> : !error && <p role="status">Building template preview…</p>}
    {error && <div role="alert"><p>{error}</p>{!mesh && <button onClick={() => setAttempt(n => n + 1)}>Retry preview</button>}</div>}
    <p>{item.learn}</p><ol className="template-instructions">{item.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="workflow-caption"><strong>Physical print test pending.</strong> {item.printNote}</p>
    <footer className="dialog-footer"><span>Saved as a new editable project on this device.</span><button className="studio-primary" disabled={!mesh || busy} onClick={async () => {
      setBusy(true); setError('')
      try { await onCreate(doc) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create this project. Please retry.') } finally { setBusy(false) }
    }}>{busy ? 'Opening…' : 'Use this template'}</button></footer>
  </WorkspaceDialog>
}
