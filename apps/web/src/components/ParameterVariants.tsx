import { lazy, Suspense, useState } from 'react'
import { useEditor } from '@/store/editor'
import { applyParameterVariant, captureParameterVariant, variantMatches } from '@/lib/parameterVariants'
const VariantManagerDialog=lazy(()=>import('./VariantManagerDialog').then(m=>({default:m.VariantManagerDialog})))

export function ParameterVariants() {
  const document = useEditor(state => state.document)
  const dispatch = useEditor(state => state.dispatch)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [manager,setManager]=useState(false)
  const variants = document.parameterVariants ?? []
  return <section className="parameter-variants workflow-card">
    <h3>Parameter variants</h3>
    <button className="workflow-action secondary" disabled={!document.namedParameters.length} onClick={()=>setManager(true)}>Compare and export variants</button>
    {manager&&<Suspense fallback={<p role="status">Opening comparison…</p>}><VariantManagerDialog onClose={()=>setManager(false)}/></Suspense>}
    <p className="workflow-caption">Save named dimensions as Small, Large, or a tested clearance. Applying a variant updates bound shapes in one undoable step.</p>
    <form onSubmit={event => {
      event.preventDefault(); setError(''); setFeedback('')
      try {
        const current = useEditor.getState().document
        const variant = captureParameterVariant(current, name)
        dispatch({ type: 'replace-document', document: { ...current, parameterVariants: [...current.parameterVariants ?? [], variant], revision: current.revision + 1, updatedAt: new Date().toISOString() } })
        setName(''); setFeedback(`Saved “${variant.name}”.`)
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this variant.') }
    }}>
      <label className="cad-select-label">Variant name<input aria-label="Variant name" placeholder="e.g. Compact or snug fit" value={name} maxLength={64} onChange={event => setName(event.target.value)} /></label>
      <button className="workflow-action secondary" disabled={!document.namedParameters.length || variants.length >= 24}>Save current parameters</button>
    </form>
    {!document.namedParameters.length && <p className="workflow-caption">Create a named parameter above, then bind it to a shape dimension in Model → Dimension bindings.</p>}
    {variants.map(variant => <div className="parameter-variant-row" key={variant.id}>
      <div><strong>{variant.name}</strong><small>{variantMatches(document, variant) ? 'Matches current parameters' : `${variant.parameters.length} saved parameter${variant.parameters.length === 1 ? '' : 's'}`}</small></div>
      <button className="workflow-action secondary" disabled={variantMatches(document, variant)} onClick={() => {
        setError(''); setFeedback('')
        try {
          const next = applyParameterVariant(useEditor.getState().document, variant)
          dispatch({ type: 'replace-document', document: next })
          if (useEditor.getState().document !== next) throw new Error('The variant could not be applied. Check the project notice.')
          useEditor.setState({ parameterErrors: {} })
          setFeedback(`Applied “${variant.name}”. Undo restores the previous values.`)
        }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not apply this variant.') }
      }}>Apply</button>
      <button className="workflow-text-action" aria-label={`Remove variant ${variant.name}`} onClick={() => { const current = useEditor.getState().document; dispatch({ type: 'replace-document', document: { ...current, parameterVariants: (current.parameterVariants ?? []).filter(v => v.id !== variant.id), revision: current.revision + 1, updatedAt: new Date().toISOString() } }); setFeedback(`Removed “${variant.name}”. Undo restores it.`) }}>Remove</button>
    </div>)}
    {error && <p className="workflow-error" role="alert">{error}</p>}{feedback && <p role="status" className="workflow-caption">{feedback}</p>}
  </section>
}
