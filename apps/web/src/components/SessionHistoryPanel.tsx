import { useMemo } from 'react'
import { useEditor } from '@/store/editor'
import { describeChange } from '@/lib/sessionHistory'
import './StudioWorkflowTools.css'

export function SessionHistoryPanel() {
  const document = useEditor(s => s.document), undo = useEditor(s => s.undoStack), redo = useEditor(s => s.redoStack), placing = useEditor(s => s.placingNodeId), jump = useEditor(s => s.jumpHistory)
  const timeline = useMemo(() => [...undo, document, ...redo].map((state, index, states) => ({ state, label: index ? describeChange(states[index - 1]!, state) : 'Earliest available state' })), [document, undo, redo])
  return <section className="workflow-card session-history" data-cad-tool="history">
    <h3>Edit history</h3><p>Return to an earlier edit or move forward again. Making a new edit replaces the redo states.</p>
    {placing && <p className="workflow-warning">Finish placing your shape before changing history.</p>}
    <ol aria-label="Session edit history">{timeline.map(({ label }, index) => <li key={index}><button disabled={Boolean(placing) || index === undo.length} aria-current={index === undo.length ? 'step' : undefined} onClick={() => jump(index)}><span className="history-step-number">{index + 1}</span><span>{label}<small>{index === undo.length ? 'Current state' : index < undo.length ? `Go back ${undo.length - index} ${undo.length - index === 1 ? 'edit' : 'edits'}` : `Redo ${index - undo.length} ${index - undo.length === 1 ? 'edit' : 'edits'}`}</small></span></button></li>)}</ol>
    <p className="workflow-caption">Up to 50 past states for this session. Save a checkpoint below to return after reopening the project.</p>
  </section>
}
