import { useEffect, useRef, useState } from 'react'
import { useEditor } from '@/store/editor'
import { addParameterPresets, PARAMETER_PRESET_MAX_BYTES, previewParameterPresets, serializeParameterPresets, type ParameterPresetReview } from '@/lib/parameterPresetExchange'
import { downloadBlob, safeFilename } from '@/lib/download'
import { WorkspaceDialog } from './WorkspaceDialog'
import './PrecisionWorkflows.css'

export function ParameterPresetExchange({ onClose }: { onClose: () => void }) {
  const document = useEditor(state => state.document)
  const [review, setReview] = useState<ParameterPresetReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const operation = useRef({ token: 0, active: false })
  useEffect(() => {
    const unsubscribe = useEditor.subscribe((next, previous) => {
      if (next.document === previous.document) return
      operation.current.token++
      if (operation.current.active) {
        operation.current.active = false
        setReview(null); setBusy(false); setStatus('')
        setError('The project changed. Choose the file and review the presets again.')
      }
    })
    return () => { unsubscribe(); operation.current.token++; operation.current.active = false }
  }, [])

  async function read(file: File) {
    // Capture before awaiting file.text: even an edit followed by undo invalidates this read.
    const source = useEditor.getState().document
    const token = ++operation.current.token
    operation.current.active = true
    setReview(null); setError(''); setStatus(''); setBusy(true)
    try {
      if (file.size > PARAMETER_PRESET_MAX_BYTES) throw new Error('Preset files must be at most 1 MiB.')
      const content = await file.text()
      if (token !== operation.current.token) return
      if (useEditor.getState().document !== source) throw new Error('The project changed. Choose the file and review the presets again.')
      setReview(previewParameterPresets(content, source))
    } catch (cause) {
      if (token === operation.current.token) {
        operation.current.active = false
        setError(cause instanceof Error ? cause.message : 'Could not read this preset file.')
      }
    } finally { if (token === operation.current.token) setBusy(false) }
  }
  function cancelPreview() {
    operation.current.token++; operation.current.active = false
    setReview(null); setBusy(false); setError(''); setStatus('Preview cancelled.')
  }
  function add() {
    if (!review || !operation.current.active) return
    try {
      const state = useEditor.getState()
      const next = addParameterPresets(state.document, review)
      operation.current.active = false
      state.dispatch({ type: 'replace-document', document: next })
      if (useEditor.getState().document !== next) throw new Error('Presets could not be added. Check the project notice.')
      setReview(null); setError(''); setStatus(`Added ${review.variants.length} preset${review.variants.length === 1 ? '' : 's'}. Undo restores the previous saved variants.`)
    } catch (cause) { setReview(null); setError(cause instanceof Error ? cause.message : 'Could not add these presets.') }
  }
  return <WorkspaceDialog portal title="Parameter preset exchange" description="Share saved parameter variants as PrintLab JSON, then review compatible presets before adding them." onClose={onClose} className="precision-dialog">
    <p>Preset files contain names, values, formulas and units. They contain no project geometry. Target parameter names and units must match exactly.</p>
    <button className="studio-secondary" disabled={!document.parameterVariants?.length} onClick={() => {
      try {
        const current = useEditor.getState().document
        downloadBlob(new Blob([serializeParameterPresets(current)], { type: 'application/json' }), `${safeFilename(current.name)}-parameter-presets.json`)
        setError(''); setStatus('Saved preset download requested.')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export saved presets.') }
    }}>Download saved presets</button>
    {!document.parameterVariants?.length && <p>Save a parameter variant first to export it.</p>}
    <label className="cad-select-label">Import preset JSON<input data-initial-focus type="file" accept=".json,application/json" aria-label="Import preset JSON" onChange={event => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file) void read(file)
    }} /></label>
    <p>Maximum 1 MiB, 24 saved variants per project and 256 parameters per variant. Existing preset names cannot be overwritten.</p>
    {busy && <p role="status">Reading and validating presets…</p>}
    {review && <section aria-label="Preset import preview">
      <h3>Review {review.variants.length} new preset{review.variants.length === 1 ? '' : 's'}</h3>
      <p>Adding presets saves variants for later use. Apply a saved variant in the Parameters panel to update dimensions.</p>
      {review.variants.map(variant => <div key={variant.id}>
        <h4 style={{ overflowWrap: 'anywhere' }}>{variant.name}</h4>
        <div className="precision-table" tabIndex={0} aria-label={`Parameters for ${variant.name}`}><table>
          <thead><tr><th scope="col">Parameter</th><th scope="col">Saved value</th><th scope="col">Unit</th><th scope="col">Formula</th></tr></thead>
          <tbody>{variant.parameters.map(parameter => <tr key={parameter.id}><th scope="row">{parameter.name}</th><td>{parameter.value}</td><td>{parameter.unit}</td><td>{parameter.expression || '—'}</td></tr>)}</tbody>
        </table></div>
      </div>)}
    </section>}
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    <footer className="dialog-footer">
      <span>{review ? `${review.variants.length} presets ready to add` : 'Choose a compatible preset file to preview.'}</span>
      {(review || busy) && <button onClick={cancelPreview}>Cancel preview</button>}
      <button className="studio-primary" disabled={!review || busy || !!useEditor.getState().placingNodeId} onClick={add}>Add presets</button>
    </footer>
  </WorkspaceDialog>
}
