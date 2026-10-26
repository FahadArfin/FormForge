import { useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, Scissors } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { applySplitPreview, previewSplitDocument, type SplitOptions, type SplitPreview } from '@/lib/planeSplit'
import { connectorDefaults, splitPlaneAxes, type SplitConnector } from '@/geometry/splitConnectors'
import { saveVersion } from '@/lib/db'
import { MeshPreview } from './MeshPreview'
import type { ModelDocument } from '@formforge/model'
import './InspectorWorkflows.css'
import './SplitPanel.css'

type ConnectorKind = 'none' | SplitConnector['kind']
const draftsFor = (kind: Exclude<ConnectorKind, 'none'>) => Object.fromEntries(Object.entries(connectorDefaults[kind]).filter(([key]) => key !== 'kind').map(([key, value]) => [key, String(value)]))

export function SplitPanel() {
  const document = useEditor(state => state.document)
  const placingNodeId = useEditor(state => state.placingNodeId)
  const drawing = useEditor(state => state.tool === 'draw-profile')
  const section = useInspection(state => state.section)
  const [keep, setKeep] = useState<SplitOptions['keep']>('both')
  const [kind, setKind] = useState<ConnectorKind>('none')
  const [drafts, setDrafts] = useState(() => draftsFor('dowel'))
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [preview, setPreview] = useState<SplitPreview | null>(null)
  const [previewIndex, setPreviewIndex] = useState('0')
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const task = useRef<AbortController | null>(null)
  const committing = useRef<ModelDocument | null>(null)
  const choiceId = useId()
  const locked = document.nodes.some(node => node.locked)
  const empty = !document.nodes.some(node => !node.suppressed)
  const settings = JSON.stringify({ kind, keep, drafts })
  const currentSettings = useRef(settings); currentSettings.current = settings
  const { u, v } = splitPlaneAxes(section.axis)
  const axes = ['X', 'Y', 'Z']
  useEffect(() => () => { task.current?.abort(); task.current = null }, [])
  useEffect(() => {
    if (document === committing.current) { committing.current = null; return }
    if (task.current || preview) {
      task.current?.abort(); task.current = null; setBusy(null); setPreview(null)
      setFeedback({ error: true, text: 'The project or split plane changed. Preview the current design again.' })
    }
    // Preview is deliberately excluded: creating it must not invalidate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, section.axis, section.offset, placingNodeId, drawing])

  const invalidate = () => { task.current?.abort(); task.current = null; setBusy(null); setPreview(null); setFeedback(null) }
  const optionsNow = (): SplitOptions => {
    const connector = kind === 'none' ? undefined : { kind, ...Object.fromEntries(Object.entries(drafts).map(([key, value]) => [key, value.trim() ? Number(value) : NaN])) } as SplitConnector
    return { axis: section.axis, offset: section.offset, keep: connector ? 'both' : keep, connector }
  }
  const isCurrent = (options: SplitOptions, signature: string) => {
    const current = useInspection.getState().section
    const editor = useEditor.getState()
    return current.axis === options.axis && current.offset === options.offset && currentSettings.current === signature && !editor.placingNodeId && editor.tool !== 'draw-profile'
  }
  const startPreview = async () => {
    if (task.current || locked || empty || placingNodeId || drawing) return
    const controller = new AbortController(), options = optionsNow(), signature = settings
    task.current = controller; setBusy('preview'); setPreview(null); setFeedback(null)
    try {
      const result = await previewSplitDocument(() => useEditor.getState().document, options, { signal: controller.signal, isCurrent: () => isCurrent(options, signature) })
      if (task.current === controller) { setPreview(result); setPreviewIndex('0') }
    } catch (error) {
      if (task.current === controller) setFeedback({ error: true, text: error instanceof Error ? error.message : 'Preview failed. Your original model is unchanged.' })
    } finally {
      if (task.current === controller) { task.current = null; setBusy(null) }
    }
  }
  const apply = async () => {
    if (!preview || task.current || locked || placingNodeId || drawing) return
    const controller = new AbortController(), signature = settings
    task.current = controller; setBusy('apply'); setFeedback(null)
    try {
      const result = await applySplitPreview(() => useEditor.getState().document, preview, saveVersion, replacement => {
        committing.current = replacement
        useEditor.getState().dispatch({ type: 'replace-document', document: replacement })
        if (useEditor.getState().document !== replacement) throw new Error('The split could not be applied. Your source is unchanged; check its locks and try again.')
      }, { signal: controller.signal, isCurrent: () => isCurrent(preview.options, signature) })
      if (task.current !== controller) return
      setPreview(null)
      useEditor.getState().selectAll(); useEditor.getState().setTool('move'); useEditor.getState().setShowResult(false)
      useInspection.getState().setSection({ enabled: false })
      setFeedback({ error: false, text: `${result.nodes.length} closed mesh part${result.nodes.length === 1 ? '' : 's'} created. Recovery checkpoint saved. Undo restores the editable source; History keeps the recovery copy after reopening.` })
      useEditor.getState().setNotice('Split applied. Recovery checkpoint saved; Undo restores your editable source.')
    } catch (error) {
      if (task.current === controller) setFeedback({ error: true, text: error instanceof Error ? error.message : 'Could not save recovery or apply this split. Your original is unchanged.' })
    } finally {
      if (task.current === controller) { task.current = null; setBusy(null) }
    }
  }
  const field = (key: string, label: string, count = false) => <label key={key}><span>{label}{count ? '' : ' (mm)'}</span><input type="number" step={count ? 1 : 'any'} value={drafts[key] ?? ''} onChange={event => { invalidate(); setDrafts(previous => ({ ...previous, [key]: event.target.value })) }} /></label>
  const previewParts = preview ? [
    ...(preview.options.keep !== 'negative' ? [{ name: 'Positive half', mesh: preview.parts.positive, label: 'Positive half preview' }] : []),
    ...(preview.options.keep !== 'positive' ? [{ name: 'Negative half', mesh: preview.parts.negative, label: 'Negative half preview' }] : []),
    ...(preview.parts.extras ?? []).map((part, index) => ({ name: `Dowel pin ${index + 1}`, mesh: part.mesh, label: `Dowel pin ${index + 1} preview` })),
  ] : []
  const visiblePart = previewParts[Number(previewIndex)] ?? previewParts[0]

  return <section className="workflow-card split-panel">
    <h3><Scissors size={16} aria-hidden="true" /> Split into closed parts</h3>
    <p className="workflow-caption">Uses the section plane above: {section.axis.toUpperCase()} = {Number(section.offset.toFixed(4))} mm. Preview each capped half before replacing your model.</p>
    <fieldset disabled={Boolean(busy)} className="split-options">
      <label>Connector<select aria-label="Connector" value={kind} onChange={event => { invalidate(); const next = event.target.value as ConnectorKind; setKind(next); if (next !== 'none') { setDrafts(draftsFor(next)); setKeep('both') } }}><option value="none">Plain split</option><option value="dowel">Dowel pins</option><option value="dovetail">Sliding dovetail</option></select></label>
      {kind === 'none' ? <fieldset className="split-keep"><legend>Keep after splitting</legend>
        {([{ value: 'both', label: 'Both halves' }, { value: 'positive', label: `Positive half (${section.axis.toUpperCase()} ≥ ${section.offset} mm)` }, { value: 'negative', label: `Negative half (${section.axis.toUpperCase()} ≤ ${section.offset} mm)` }] as const).map(choice => <label key={choice.value}><input type="radio" name={choiceId} value={choice.value} checked={keep === choice.value} onChange={() => { invalidate(); setKeep(choice.value) }} />{choice.label}</label>)}
      </fieldset> : <>
        <p className="workflow-caption">{kind === 'dowel' ? 'Matching blind sockets in both halves, plus separate printable pins.' : `A matching rail and open-ended channel. Assemble by sliding along ${axes[v]}; the entire rail needs a continuous, unobstructed cut face.`}</p>
        <div className="split-dimensions">
          {kind === 'dowel' ? <>{field('diameter', 'Pin diameter')}{field('depth', 'Socket depth')}</> : <>{field('neckWidth', 'Dovetail neck width')}{field('headWidth', 'Dovetail head width')}{field('depth', 'Dovetail depth')}</>}
          {field('count', 'Connector count', true)}{field('spacing', 'Spacing')}
          {field('centerU', `Offset ${axes[u]}`)}{kind === 'dowel' && field('centerV', `Offset ${axes[v]}`)}
          {field('clearance', 'Clearance per side')}{field('wall', 'Minimum surrounding wall')}
        </div>
        <p className="workflow-caption">Offsets start at the model bounds’ center on the cut plane. Connectors form a row along {axes[u]}. Clearance is per side; print a fit test before committing to a full part.</p>
        <p className="workflow-caption">Apply places every connector part beside one another on the bed with an 8 mm gap, so exports keep them separate. Check printer fit and choose print orientations before export; the row may exceed your build plate.</p>
      </>}
    </fieldset>
    <p className="workflow-caption">Applying bakes the whole evaluated model, sculpting, parameter bindings and material assignments into independent mesh parts in one color. An automatic recovery checkpoint preserves your editable source first. Undo also restores it.</p>
    {locked && <p className="workflow-warning">Unlock every shape before splitting, including hidden or suppressed shapes.</p>}
    {placingNodeId && <p className="workflow-warning">Finish placing your shape before splitting.</p>}
    {drawing && <p className="workflow-warning">Finish or cancel drawing the profile before splitting.</p>}
    {empty && <p className="workflow-caption">Add a solid shape before splitting.</p>}
    <div className="workflow-actions"><button className="workflow-action" disabled={Boolean(busy) || locked || empty || Boolean(placingNodeId) || drawing} onClick={() => void startPreview()}>{busy === 'preview' ? <LoaderCircle size={16} className="workflow-spinner" /> : <Scissors size={16} />} {busy === 'preview' ? 'Preparing preview…' : 'Preview split'}</button>{busy && <button className="workflow-action secondary" onClick={() => { invalidate(); setFeedback({ error: false, text: 'Split cancelled. Your model was not changed.' }) }}>Cancel split</button>}</div>
    {preview && visiblePart && <div className="split-preview">
      <label>Preview part<select aria-label="Preview part" value={previewIndex} onChange={event => setPreviewIndex(event.target.value)}>{previewParts.map((part, index) => <option key={part.name} value={index}>{part.name}</option>)}</select></label>
      <MeshPreview mesh={visiblePart.mesh} label={visiblePart.label} />
      {preview.parts.notes?.map(note => <p key={note} className="workflow-caption">{note}</p>)}
      <div className="workflow-actions"><button className="workflow-action" disabled={Boolean(busy) || locked || Boolean(placingNodeId) || drawing} onClick={() => void apply()}>{busy === 'apply' ? 'Saving recovery…' : 'Apply split'}</button><button className="workflow-action secondary" disabled={Boolean(busy)} onClick={invalidate}>Discard preview</button></div>
    </div>}
    {feedback && <p className={feedback.error ? 'workflow-error' : 'workflow-feedback'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </section>
}
