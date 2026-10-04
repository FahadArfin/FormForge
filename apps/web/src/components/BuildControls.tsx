import { useEditor } from '@/store/editor'
import './StudioWorkflowTools.css'

export function BuildModeControls() {
  const mode = useEditor(s => s.buildMode), setMode = useEditor(s => s.setBuildMode)
  return <section className="workflow-card" data-cad-tool="rebuild"><h3>Preview rebuilding</h3><label className="build-mode-label">Update the solid preview<select value={mode} onChange={e => setMode(e.target.value as 'automatic' | 'manual')}><option value="automatic">Automatically after edits</option><option value="manual">Only when I choose Rebuild</option></select></label><p className="workflow-caption">For complex models, manual rebuilding lets you make several edits first. Your editable project still saves automatically. New projects start in automatic mode.</p></section>
}

export function ManualBuildNotice() {
  const mode = useEditor(s => s.buildMode), document = useEditor(s => s.document), built = useEditor(s => s.meshDocument), status = useEditor(s => s.geometryStatus), placing = useEditor(s => s.placingNodeId)
  if (mode !== 'manual' || document === built || placing || status === 'building') return null
  return <div className="manual-build-notice"><span role="status"><strong>Preview needs a rebuild</strong><small>Your edits are saved as usual. Measurements need the updated solid.</small></span><button onClick={() => void useEditor.getState().rebuild()}>Rebuild now</button><button onClick={() => useEditor.getState().setBuildMode('automatic')}>Use automatic</button></div>
}
