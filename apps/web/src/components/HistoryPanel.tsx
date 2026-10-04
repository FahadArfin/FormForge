import { useEffect, useState } from 'react'
import { AlertCircle, Download, History, LoaderCircle, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { listVersions, saveVersion, type ProjectVersion } from '@/lib/db'
import { restoreCheckpointSafely } from '@/lib/checkpointRecovery'
import './InspectorWorkflows.css'
import { SessionHistoryPanel } from './SessionHistoryPanel'
import { BuildModeControls } from './BuildControls'

interface VersionListState {
  projectId: string
  versions: ProjectVersion[]
  loading: boolean
  error: string | null
}

export function HistoryPanel() {
  const document = useEditor((state) => state.document)
  const importDocument = useEditor((state) => state.importDocument)
  const setNotice = useEditor((state) => state.setNotice)
  const [list, setList] = useState<VersionListState>({ projectId: document.id, versions: [], loading: true, error: null })
  const [retry, setRetry] = useState(0)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let request = 0
    const projectId = document.id
    const refresh = () => {
      const currentRequest = ++request
      setList({ projectId, versions: [], loading: true, error: null })
      void listVersions(projectId).then((versions) => {
        if (!cancelled && currentRequest === request) setList({ projectId, versions, loading: false, error: null })
      }).catch((cause) => {
        if (!cancelled && currentRequest === request) setList({ projectId, versions: [], loading: false, error: cause instanceof Error ? cause.message : 'Could not load checkpoints from this device.' })
      })
    }
    refresh()
    window.addEventListener('formforge:version-saved', refresh)
    return () => { cancelled = true; window.removeEventListener('formforge:version-saved', refresh) }
  }, [document.id, retry])

  useEffect(() => { setLabel(''); setActionError(null); setFeedback(null); setBusy(null) }, [document.id])

  const announce = (message: string) => {
    setFeedback(message)
    setNotice(message)
  }
  const save = async () => {
    const captured = useEditor.getState().document
    setBusy('save'); setActionError(null); setFeedback(null)
    try {
      const saved = await saveVersion(captured, label)
      window.dispatchEvent(new Event('formforge:version-saved'))
      if (useEditor.getState().document.id === captured.id) { setLabel(''); announce(`“${saved.label}” saved on this device.`) }
    } catch (cause) {
      if (useEditor.getState().document.id === captured.id) setActionError(cause instanceof Error ? cause.message : 'Could not save a checkpoint.')
    } finally { if (useEditor.getState().document.id === captured.id) setBusy(null) }
  }
  const restore = async (version: ProjectVersion) => {
    setBusy(version.id); setActionError(null); setFeedback(null)
    try {
      await restoreCheckpointSafely(version, () => useEditor.getState().document, saveVersion, importDocument)
      window.dispatchEvent(new Event('formforge:version-saved'))
      announce(`Restored “${version.label}”. Your previous work is preserved in a “Before restore” checkpoint.`)
    } catch (cause) {
      window.dispatchEvent(new Event('formforge:version-saved'))
      if (useEditor.getState().document.id === version.projectId) setActionError(`Your work was not replaced. ${cause instanceof Error ? cause.message : 'Could not save the recovery checkpoint.'}`)
    } finally { if (useEditor.getState().document.id === version.projectId) setBusy(null) }
  }
  const loading = list.projectId !== document.id || list.loading
  const error = list.projectId === document.id ? list.error : null
  const versions = list.projectId === document.id ? list.versions : []

  return <div className="inspector-workflow checkpoint-review">
    <SessionHistoryPanel />
    <BuildModeControls />
    <button className="workflow-action secondary" onClick={()=>window.dispatchEvent(new Event('formforge:recovery'))}>Browse automatic recovery copies</button>
    <header className="workflow-intro"><History size={23} /><div><h2>Save a moment to return to</h2><p>Checkpoints keep an editable copy of your project on this device.</p></div></header>
    <form className="workflow-card checkpoint-create" onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label><span>Checkpoint name <small>optional</small></span><input placeholder="Before adding the handle" maxLength={100} value={label} disabled={Boolean(busy)} onChange={(event) => setLabel(event.target.value)} /></label>
      <button type="submit" className="workflow-action" disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle size={16} className="workflow-spinner" /> : <Plus size={16} />} Save checkpoint</button>
    </form>
    {feedback && <p className="workflow-feedback" role="status">{feedback}</p>}
    {actionError && <div className="workflow-message" role="alert"><AlertCircle size={18} /><div><p>{actionError}</p><button className="workflow-text-action" onClick={() => window.dispatchEvent(new CustomEvent('formforge:open-export', { detail: { format: 'project' } }))}><Download size={14} /> Download an editable backup</button></div></div>}
    <div className="workflow-section-heading"><h3>Local checkpoints</h3>{!loading && !error && <span>{versions.length} / 25</span>}</div>
    <p className="workflow-caption">Restoring first saves your current work as a recovery checkpoint. The latest 25 checkpoints are kept.</p>
    {loading ? <div className="workflow-empty" role="status"><LoaderCircle size={21} className="workflow-spinner" /><p>Loading checkpoints…</p></div>
      : error ? <div className="workflow-message" role="alert"><AlertCircle size={18} /><div><p>{error}</p><button className="workflow-action secondary" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={15} /> Retry</button></div></div>
        : versions.length ? <ol className="checkpoint-list">{versions.map((version) => <li key={version.id}><article>
          <div className="checkpoint-marker"><History size={16} /></div><div className="checkpoint-copy"><h4>{version.label}</h4><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString()}</time><p>{version.document.nodes.length} {version.document.nodes.length === 1 ? 'feature' : 'features'}</p><button className="workflow-action secondary" disabled={Boolean(busy)} aria-label={`Restore ${version.label}`} onClick={() => void restore(version)}>{busy === version.id ? <LoaderCircle size={15} className="workflow-spinner" /> : <RotateCcw size={15} />} {busy === version.id ? 'Preserving current work…' : 'Restore checkpoint'}</button></div>
        </article></li>)}</ol>
          : <div className="workflow-empty"><History size={27} /><h3>No checkpoints yet</h3><p>Save your first checkpoint above before trying a new idea.</p></div>}
    <p className="workflow-caption checkpoint-local-note">Checkpoints stay in this browser. Download an editable backup to keep a separate copy.</p>
  </div>
}
