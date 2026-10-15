import { useEffect, useRef, useState } from 'react'
import { Grid3X3, Triangle, CircleDot, LoaderCircle } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { parseNumericExpression } from '@/lib/numericExpression'
import { printPartDefaults, type PrintPartOptions } from '@/lib/printPartRecipes'
import { applyPrintPart, previewPrintPart, type PrintPartPreview } from '@/lib/printPartPreview'
import { MeshPreview } from './MeshPreview'
import './PrintFriendlyParts.css'

type Kind = PrintPartOptions['kind']
const choices = [{ kind: 'vent', label: 'Vented panel', icon: Grid3X3 }, { kind: 'bracket', label: 'Ribbed bracket', icon: Triangle }, { kind: 'boss', label: 'Insert boss', icon: CircleDot }] as const
const labels: Record<string, string> = { width: 'Width', depth: 'Depth', thickness: 'Panel thickness', cornerRadius: 'Corner radius', rows: 'Rows', columns: 'Columns', openingWidth: 'Opening width', openingLength: 'Slot length', gap: 'Material between openings', border: 'Border', height: 'Height', wall: 'Wall thickness', ribThickness: 'Rib thickness', ribCount: 'Ribs', ribReach: 'Rib reach', ribHeight: 'Rib height', holeDiameter: 'Mounting hole diameter', outerDiameter: 'Boss diameter', boreDiameter: 'Insert bore diameter', boreDepth: 'Insert bore depth', leadIn: 'Entry chamfer', baseDiameter: 'Base diameter', baseThickness: 'Base thickness' }
const counts = new Set(['rows', 'columns', 'ribCount'])
const draftFor = (kind: Kind) => Object.fromEntries(Object.entries(printPartDefaults[kind]).filter(([key]) => key !== 'kind').map(([key, value]) => [key, String(value)]))

export function PrintFriendlyParts() {
  const document = useEditor(state => state.document)
  const placing = useEditor(state => state.placingNodeId)
  const drawing = useEditor(state => state.tool === 'draw-profile')
  const [kind, setKind] = useState<Kind>('vent')
  const [draft, setDraft] = useState(draftFor('vent'))
  const [preview, setPreview] = useState<PrintPartPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const task = useRef<AbortController | null>(null)
  const previous = useRef(document)
  const invalidate = () => { task.current?.abort(); task.current = null; setBusy(false); setPreview(null); setMessage(''); setError('') }
  useEffect(() => () => { task.current?.abort(); task.current = null }, [])
  useEffect(() => {
    if (previous.current !== document) { const hadPreview = Boolean(task.current || preview); previous.current = document; invalidate(); if (hadPreview) setMessage('Project changed. Preview again before adding the part.') }
  }, [document]) // A proposal belongs to the exact document it was prepared against.
  const blocked = Boolean(placing || drawing || document.sculptStrokes.length)
  const prepare = async () => {
    if (blocked) return
    invalidate()
    const controller = new AbortController(); task.current = controller; setBusy(true)
    try {
      const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, key === 'pattern' ? value : key === 'openingLength' && draft.pattern === 'round' ? 0 : parseNumericExpression(value, counts.has(key) ? undefined : 'mm')]))
      const result = await previewPrintPart(() => useEditor.getState().document, { kind, ...values } as PrintPartOptions, controller.signal)
      if (task.current === controller) { setPreview(result); setMessage('Closed geometry checked. Review the preview and dimensions, then add the part.') }
    } catch (cause) {
      if (task.current === controller && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to preview the part.')
    } finally { if (task.current === controller) { task.current = null; setBusy(false) } }
  }
  const apply = () => {
    if (!preview) return
    try {
      const state = useEditor.getState()
      if (state.placingNodeId || state.tool === 'draw-profile') throw new Error('Finish or cancel the current drawing first.')
      applyPrintPart(() => useEditor.getState().document, preview, nodes => state.dispatch({ type: 'add-nodes', nodes }))
      state.selectNode(preview.part.nodes[0]!.id); state.setTool('move'); state.setShowResult(false)
      state.setNotice(`${preview.part.title} added as editable shapes. Move it, or select it with another part and Join. Undo removes the complete part.`)
      invalidate()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add the part.') }
  }
  return <section className="workflow-card print-friendly-parts" aria-labelledby="print-friendly-title">
    <h3 id="print-friendly-title">Print-friendly parts</h3>
    <p className="workflow-caption">Build useful details with measured spacing and editable shapes. Preview first, then add beside your model.</p>
    <div className="print-part-choices" role="group" aria-label="Part recipe">{choices.map(choice => <button key={choice.kind} type="button" aria-pressed={kind === choice.kind} onClick={() => { invalidate(); setKind(choice.kind); setDraft(draftFor(choice.kind)) }}><choice.icon size={20} aria-hidden="true"/><span>{choice.label}</span></button>)}</div>
    <form onSubmit={event => { event.preventDefault(); void prepare() }}>
      {kind === 'vent' && <label className="cad-select-label">Opening shape<select value={draft.pattern} onChange={event => { invalidate(); setDraft({ ...draft, pattern: event.target.value }) }}><option value="slots">Rounded slots</option><option value="round">Round holes</option></select></label>}
      <div className="print-part-fields">{Object.entries(draft).filter(([key]) => key !== 'pattern' && !(key === 'openingLength' && draft.pattern === 'round')).map(([key, value]) => <label key={`${kind}-${key}`}><span>{labels[key]}{!counts.has(key) && <small>mm</small>}</span><input aria-label={`${labels[key]}${counts.has(key) ? '' : ' (mm)'}`} type="text" inputMode="decimal" maxLength={48} value={value} onChange={event => { invalidate(); setDraft({ ...draft, [key]: event.target.value }) }}/></label>)}</div>
      {kind === 'vent' && <p className="workflow-caption">Openings are centered. Border and gap are solid material, not center-to-center spacing. Up to 64 openings.</p>}
      {kind === 'bracket' && <p className="workflow-caption">Choose one center rib or two side ribs. Four mounting holes stay clear of the ribs. Use your measured screw clearance.</p>}
      {kind === 'boss' && <p className="workflow-caption">Enter the bore recommended for your specific insert. These example values do not identify a screw size. Print a fit test before using the mount.</p>}
      {blocked && <p className="workflow-warning">{document.sculptStrokes.length ? 'Bake volume sculpting before adding a part.' : 'Finish or cancel the current drawing first.'}</p>}
      <div className="workflow-actions"><button className="workflow-action" type="submit" disabled={blocked || busy}>{busy ? <LoaderCircle size={16} className="workflow-spinner"/> : null}{busy ? 'Checking geometry…' : 'Preview part'}</button>{(busy || preview) && <button className="workflow-action secondary" type="button" onClick={() => { invalidate(); setMessage('Preview discarded. Your model is unchanged.') }}>Discard preview</button>}</div>
    </form>
    {error && <p className="workflow-error" role="alert">{error}</p>}
    {message && <p className="workflow-caption" role="status">{message}</p>}
    {preview && preview.source === document && <div className="print-part-preview">
      <MeshPreview mesh={preview.mesh} label={`${preview.part.title} preview`}/>
      <h4>Design dimensions</h4><ul>{preview.part.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
      <h4>Before you print</h4>{preview.part.warnings.map(warning => <p key={warning} className="workflow-caption">{warning}</p>)}
      <button className="workflow-action" type="button" disabled={blocked} onClick={apply}>Add editable part</button>
      <p className="workflow-caption">Adds one movable group. Move, resize or combine it with other parts. Undo removes the whole addition. Separate releases the construction shapes as solids; restore the cutters to Cutout and Join again to recreate the openings.</p>
    </div>}
  </section>
}
