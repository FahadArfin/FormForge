import { useEffect, useState } from 'react'
import { Eraser } from 'lucide-react'
import type { ModelDocument } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { hasResettableModel } from '@/lib/resetModel'
import { WorkspaceDialog } from './WorkspaceDialog'

export function ResetModelButton({ active }: { active: boolean }) {
  const document = useEditor(state => state.document)
  const placing = useEditor(state => Boolean(state.placingNodeId) || state.tool === 'draw-profile')
  const [confirmedDocument, setConfirmedDocument] = useState<ModelDocument | null>(null)
  useEffect(() => { setConfirmedDocument(null) }, [document, active, placing])
  const close = () => setConfirmedDocument(null)
  const reset = () => {
    if (confirmedDocument && useEditor.getState().resetModel(confirmedDocument)) {
      useInspection.setState({ focus: null, pendingFit: null, anglePoints: [], circlePoints: [], overhangs: false, pickOverlaps: false, snapLabel: '' })
      useInspection.getState().resetSection()
    }
    close()
  }
  return <>
    <button className="studio-icon" aria-label="Reset build plate" title={placing ? 'Finish or cancel drawing before resetting' : 'Reset build plate'} disabled={placing || !hasResettableModel(document)} onClick={() => setConfirmedDocument(document)}><Eraser size={18} /></button>
    {active && confirmedDocument === document && <WorkspaceDialog title="Reset the build plate?" description={`Start fresh in “${document.name}”.`} onClose={close} className="reset-model-dialog" portal>
      <p>Clears all shapes, sculpting, parameters, measurements, and reference images, including hidden or locked shapes.</p>
      <p>Your project name, printer and material settings, and saved checkpoints stay. <strong>Undo restores the previous model during this session.</strong></p>
      <div className="reset-model-actions">
        <button className="studio-secondary" data-initial-focus onClick={close}>Keep editing</button>
        <button className="studio-primary" onClick={reset}><Eraser size={16} /> Reset build plate</button>
      </div>
    </WorkspaceDialog>}
  </>
}
