import { useState } from 'react'
import { useEditor } from '@/store/editor'
import type { PlatePlacementAction, PlatePlacementScope } from '@/lib/platePlacement'

export function PlatePlacementPanel() {
  const [scope, setScope] = useState<PlatePlacementScope>('document')
  const [busy, setBusy] = useState(false)
  const selected = useEditor(state => state.selectedNodeIds.length)
  const count = useEditor(state => state.document.nodes.length)
  const placing = useEditor(state => state.placingNodeId)
  const place = async (action: PlatePlacementAction) => {
    setBusy(true)
    try { await useEditor.getState().placeOnPlate(scope, action) }
    finally { setBusy(false) }
  }
  return <section className="workflow-card">
    <h3>Place on build plate</h3>
    <p className="workflow-caption">Move parts together without changing their spacing. Combined groups stay together.</p>
    <label className="cad-select-label">Move<select aria-label="Plate placement scope" disabled={busy} value={scope} onChange={event => setScope(event.target.value as PlatePlacementScope)}><option value="document">Whole model</option><option value="selection" disabled={!selected}>Selected shapes and groups</option></select></label>
    <div className="workflow-actions">
      <button className="workflow-action secondary" disabled={busy || !count || !!placing || (scope === 'selection' && !selected)} onClick={() => void place('center')}>Center X/Y</button>
      <button className="workflow-action secondary" disabled={busy || !count || !!placing || (scope === 'selection' && !selected)} onClick={() => void place('drop')}>Drop to plate</button>
    </div>
    <button className="workflow-action" disabled={busy || !count || !!placing || (scope === 'selection' && !selected)} onClick={() => void place('center-and-drop')}>{busy ? 'Placing…' : 'Center and drop'}</button>
  </section>
}
