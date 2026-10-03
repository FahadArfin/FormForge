import { useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, Scissors } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { splitDocumentSafely, type SplitOptions } from '@/lib/planeSplit'
import './InspectorWorkflows.css'

export function SplitPanel() {
  const document = useEditor(state => state.document)
  const placingNodeId = useEditor(state => state.placingNodeId)
  const section = useInspection(state => state.section)
  const [keep, setKeep] = useState<SplitOptions['keep']>('both')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const task = useRef<AbortController | null>(null)
  const choiceId = useId()
  const locked = document.nodes.some(node => node.locked)
  const empty = !document.nodes.some(node => !node.suppressed)
  useEffect(() => () => { task.current?.abort(); task.current = null }, [])

  const split = async () => {
    if (task.current || locked || empty || placingNodeId) return
    const controller = new AbortController()
    const options = { axis: section.axis, offset: section.offset, keep }
    task.current = controller
    setBusy(true); setFeedback(null)
    try {
      const result = await splitDocumentSafely(() => useEditor.getState().document, options, replacement => {
        useEditor.getState().dispatch({ type: 'replace-document', document: replacement })
        if (useEditor.getState().document !== replacement) throw new Error('The split could not be applied. Your model is unchanged; check its locks and try again.')
      }, {
        signal: controller.signal,
        isCurrent: () => {
          const current = useInspection.getState().section
          return current.axis === options.axis && current.offset === options.offset
        },
      })
      if (task.current !== controller) return
      useEditor.getState().selectAll()
      useEditor.getState().setTool('move')
      useInspection.getState().setSection({ enabled: false })
      const text = `${result.nodes.length === 2 ? 'Two closed mesh parts' : 'One closed mesh part'} kept at ${options.axis.toUpperCase()} = ${Number(options.offset.toFixed(4))} mm. Undo restores your editable source shapes.`
      setFeedback({ error: false, text })
      useEditor.getState().setNotice('Model split. Undo restores the original project geometry.')
    } catch (error) {
      if (task.current === controller) setFeedback({ error: !(error instanceof DOMException && error.name === 'AbortError'), text: error instanceof Error ? error.message : 'Splitting failed. Your original model is unchanged.' })
    } finally {
      if (task.current === controller) { task.current = null; setBusy(false) }
    }
  }
  const cancel = () => {
    task.current?.abort(); task.current = null; setBusy(false)
    setFeedback({ error: false, text: 'Split cancelled. Your model was not changed.' })
  }

  return <section className="workflow-card split-panel">
    <h3><Scissors size={16} aria-hidden="true" /> Split into closed parts</h3>
    <p className="workflow-caption">Uses the section plane above: {section.axis.toUpperCase()} = {Number(section.offset.toFixed(4))} mm. Each kept half gets a capped, closed cut surface.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: '12px 0', display: 'grid', gap: 8 }}>
      <legend style={{ fontWeight: 600, marginBottom: 7 }}>Keep after splitting</legend>
      {([{ value: 'both', label: 'Both halves' }, { value: 'positive', label: `Positive half (${section.axis.toUpperCase()} ≥ ${section.offset} mm)` }, { value: 'negative', label: `Negative half (${section.axis.toUpperCase()} ≤ ${section.offset} mm)` }] as const).map(choice => <label key={choice.value} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="radio" name={choiceId} value={choice.value} checked={keep === choice.value} onChange={() => setKeep(choice.value)} />{choice.label}</label>)}
    </fieldset>
    <p className="workflow-caption">Replaces the whole evaluated model, including sculpting, with mesh parts in one color. Editable source shapes, parameter bindings, and material assignments are baked away. Undo restores them; save a checkpoint first for a lasting recovery copy.</p>
    {locked && <p className="workflow-warning">Unlock every shape before splitting, including hidden or suppressed shapes.</p>}
    {placingNodeId && <p className="workflow-warning">Finish placing your shape before splitting.</p>}
    {empty && <p className="workflow-caption">Add a solid shape before splitting.</p>}
    <div className="workflow-actions" style={{ marginTop: 12 }}><button className="workflow-action" disabled={busy || locked || empty || Boolean(placingNodeId)} onClick={() => void split()}>{busy ? <LoaderCircle size={16} className="workflow-spinner" /> : <Scissors size={16} />} {busy ? 'Splitting model…' : 'Split model'}</button>{busy && <button className="workflow-action secondary" onClick={cancel}>Cancel split</button>}</div>
    {feedback && <p style={{ marginTop: 10 }} className={feedback.error ? 'workflow-error' : 'workflow-feedback'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </section>
}
