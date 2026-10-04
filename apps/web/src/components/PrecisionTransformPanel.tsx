import { useEffect, useMemo, useState } from 'react'
import { useEditor } from '@/store/editor'
import { completeSelection } from '@/lib/assemblies'
import { transformAssembly, type PrecisionTransform } from '@/lib/precisionTransform'
import { NumberInput } from './NumberInput'
import './StudioWorkflowTools.css'

const initial = (): PrecisionTransform => ({ translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, pivot: 'center' })
const axes = ['x', 'y', 'z'] as const

export function PrecisionTransformPanel() {
  const document = useEditor(s => s.document), ids = useEditor(s => s.selectedNodeIds), activeId = useEditor(s => s.selectedNodeId), placing = useEditor(s => s.placingNodeId)
  const [draft, setDraft] = useState(initial), [feedback, setFeedback] = useState('')
  const selected = useMemo(() => completeSelection(document.nodes, ids), [document.nodes, ids])
  const selectionKey = ids.join('|')
  useEffect(() => { setDraft(initial()); setFeedback('') }, [document, selectionKey, activeId])
  const locked = selected.some(n => n.locked)
  const blocked = !selected.length || locked || Boolean(placing) || Boolean(document.sculptStrokes.length)
  const changed = draft.scale !== 1 || [...Object.values(draft.translation), ...Object.values(draft.rotation)].some(v => v !== 0)
  const apply = () => {
    const live = useEditor.getState()
    if (live.document !== document || live.selectedNodeIds.join('|') !== selectionKey || live.placingNodeId) { setFeedback('The project or selection changed. Review the values and try again.'); return }
    try {
      const next = transformAssembly(document, ids, activeId, draft)
      if (next === document) return
      live.dispatch({ type: 'replace-document', document: next })
      if (useEditor.getState().document !== document) live.setNotice(`Transformed ${selected.length} ${selected.length === 1 ? 'shape' : 'shapes'} together. Undo restores the whole assembly.`)
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not apply this transform.') }
  }
  return <section className="workflow-card precision-transform" data-cad-tool="transform">
    <h3>Precise assembly transform</h3>
    <p>{selected.length ? `${selected.length} shapes will move together, including grouped shapes and attached holes.` : 'Select a shape or assembly in the model list first.'}</p>
    {locked && <p className="workflow-warning">Unlock every affected shape to transform this assembly.</p>}
    {!!document.sculptStrokes.length && <p className="workflow-warning">Bake volume sculpting by exporting and reimporting before transforming assemblies.</p>}
    {placing && <p>Finish placing your shape first.</p>}
    <fieldset disabled={blocked}><legend>Move in world axes</legend><div className="precision-fields">{axes.map(axis => <NumberInput key={axis} label={axis.toUpperCase()} accessibleLabel={`Assembly move ${axis.toUpperCase()}`} suffix="mm" value={draft.translation[axis]} min={-10000} max={10000} onChange={value => setDraft(d => ({ ...d, translation: { ...d.translation, [axis]: value } }))} />)}</div></fieldset>
    <fieldset disabled={blocked}><legend>Rotate around the pivot (XYZ)</legend><div className="precision-fields">{axes.map(axis => <NumberInput key={axis} label={axis.toUpperCase()} accessibleLabel={`Assembly rotation ${axis.toUpperCase()}`} suffix="°" value={draft.rotation[axis]} min={-360} max={360} onChange={value => setDraft(d => ({ ...d, rotation: { ...d.rotation, [axis]: value } }))} />)}</div></fieldset>
    <div className="precision-settings"><NumberInput label="Uniform scale" value={draft.scale} min={.001} max={100} step={.1} disabled={blocked} onChange={scale => setDraft(d => ({ ...d, scale }))} /><label>Pivot<select disabled={blocked} value={draft.pivot} onChange={e => setDraft(d => ({ ...d, pivot: e.target.value as PrecisionTransform['pivot'] }))}><option value="center">Selection center</option><option value="active">Active shape origin</option><option value="world">World origin</option></select></label></div>
    <p className="workflow-caption">Values are offsets. Scale and rotation use the chosen pivot, then the move is added. Selection center uses source bounds before cuts. Scale 1 keeps the current size.</p>
    {selected.some(n => Object.keys(n.parameterBindings ?? {}).some(k => /position|rotation|scale/.test(k))) && <p className="workflow-warning">Formulas controlling changed transform values will be detached. Other formulas stay linked.</p>}
    {selected.some(n => n.faceAttachment) && <p className="workflow-caption">Attached holes support moves and rotations. Resize target dimensions instead of scaling.</p>}
    {feedback && <p role="alert" className="workflow-error">{feedback}</p>}
    <div className="workflow-actions"><button className="workflow-action" disabled={blocked || !changed} onClick={apply}>Apply transform</button><button className="workflow-action secondary" disabled={!changed} onClick={() => { setDraft(initial()); setFeedback('') }}>Reset values</button></div>
    <p className="workflow-caption">Nothing changes until Apply. One Undo restores all affected shapes.</p>
  </section>
}
