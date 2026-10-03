import { ArrowLeft, ChevronDown, Check, Download, FilePlus2, FolderOpen, History, LoaderCircle, Redo2, Save, Search, Sparkles, Undo2, Users, CircleHelp, HardDrive, AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { downloadBlob, safeFilename } from '@/lib/download'
import { export3mf, exportGlb, exportMultiColor3mf, exportObj, exportStl } from '@/lib/exporters'
import { saveVersion } from '@/lib/db'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'
import { WorkspaceDialog } from './WorkspaceDialog'

export function TopBar({ theme, onToggleTheme, onOpenProjects, onOpenCommunity, onOpenGenerate, onImport, onCommands, onHelp, exportOpen, onExportChange }: {
  theme: AppearanceTheme; onToggleTheme: () => void; onOpenProjects: () => void; onOpenCommunity: () => void; onOpenGenerate: () => void;
  onImport: () => void; onCommands: () => void; onHelp: () => void; exportOpen: boolean; onExportChange: (open: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [format, setFormat] = useState('3mf')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [checkpointName, setCheckpointName] = useState('')
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [checkpointFeedback, setCheckpointFeedback] = useState('')
  const document = useEditor((state) => state.document)
  const mesh = useEditor((state) => state.mesh)
  const meshDocument = useEditor((state) => state.meshDocument)
  const placingNodeId = useEditor((state) => state.placingNodeId)
  const geometryStatus = useEditor((state) => state.geometryStatus)
  const undoStack = useEditor((state) => state.undoStack)
  const redoStack = useEditor((state) => state.redoStack)
  const dispatch = useEditor((state) => state.dispatch)
  const undo = useEditor((state) => state.undo)
  const redo = useEditor((state) => state.redo)
  const newDocument = useEditor((state) => state.newDocument)
  const setNotice = useEditor((state) => state.setNotice)
  const saveStatus = useEditor((state) => state.saveStatus)
  const saveError = useEditor((state) => state.saveError)
  const saveNow = useEditor((state) => state.saveNow)
  const meshReady = geometryStatus === 'ready' && meshDocument === document && !placingNodeId && Boolean(mesh?.triangleCount)
  const formats = [
    { id: '3mf', title: '3MF', description: 'Recommended for 3D printing. Includes units.', tag: 'Recommended' },
    { id: 'stl', title: 'STL', description: 'Universal compatibility with 3D slicers.' },
    { id: 'project', title: 'Editable backup', description: 'Keep shapes, parameters, and your project editable.', tag: '.forge.json' },
    { id: 'glb', title: 'GLB', description: 'A compact 3D mesh for the web and other apps.' },
    { id: 'obj', title: 'OBJ', description: 'An evaluated mesh for other modeling tools.' },
    { id: 'ams', title: 'Multi-color 3MF', description: 'Per-part material slots for multi-color printing.' },
  ]
  const multiColorUnsupported = document.sculptStrokes.length > 0 || document.nodes.some((node) => !node.suppressed && (node.boolean !== 'add' || node.groupOperation === 'hull' || Object.values(node.surface ?? {}).some((value) => value > 0)))
  const canExport = format === 'project' || (meshReady && (format !== 'ams' || !multiColorUnsupported))
  const download = async () => {
    if (!canExport || exporting) return
    setExporting(true)
    setExportError('')
    try {
      const filename = safeFilename(document.name)
      if (format === 'project') downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), `${filename}.forge.json`)
      else if (format === 'ams') downloadBlob(exportMultiColor3mf(document.nodes, document.name), `${filename}-ams.3mf`)
      else if (mesh) {
        const blob = format === 'stl' ? exportStl(mesh) : format === '3mf' ? export3mf(mesh, document.name) : format === 'glb' ? await exportGlb(mesh) : exportObj(mesh)
        downloadBlob(blob, `${filename}.${format}`)
      }
      setNotice(`${format === 'project' ? 'Editable backup' : formats.find((item) => item.id === format)?.title} downloaded.`)
      onExportChange(false)
    } catch (error) { setExportError(error instanceof Error ? error.message : 'The export could not be completed.') }
    finally { setExporting(false) }
  }
  const createCheckpoint = async () => {
    setCheckpointBusy(true); setCheckpointFeedback('')
    try { await saveVersion(document, checkpointName); window.dispatchEvent(new Event('formforge:version-saved')); setCheckpointName(''); setCheckpointFeedback('Checkpoint saved. Restore it from the History tab.'); setNotice('Checkpoint saved on this device.') }
    catch { setCheckpointFeedback('Checkpoint could not be saved. Download an editable backup to keep your work.'); setNotice('Checkpoint could not be saved. Please try again.') }
    finally { setCheckpointBusy(false) }
  }
  const action = (callback: () => void) => { setMenuOpen(false); callback() }
  return <>
    <header className="studio-header">
      <button className="studio-home" aria-label="Open projects" title="Back to your workshop" onClick={onOpenProjects}><ArrowLeft size={18} /><span className="brand-mark"><span /></span></button>
      <div className="studio-project"><div><input className="studio-project-name" value={document.name} aria-label="Project name" onChange={(event) => dispatch({ type: 'rename-document', name: event.target.value })} /><button className="studio-icon" title="Project actions" aria-label="Project actions" onClick={() => setMenuOpen(true)}><ChevronDown size={16} /></button></div>
        <button className={`device-save ${saveStatus}`} title={saveError || 'Autosaved in this browser. Click to save now. Download an editable backup for a separate copy.'} onClick={() => void saveNow()} aria-live="polite">{saveStatus === 'saving' ? <LoaderCircle size={12} /> : saveStatus === 'error' ? <AlertCircle size={12} /> : <Check size={12} />}<span>{saveStatus === 'saving' ? 'Saving on this device…' : saveStatus === 'error' ? 'Save failed · retry' : 'Saved on this device'}</span></button>
      </div>
      <div className="studio-history"><button className="studio-icon" title="Undo (Ctrl Z)" aria-label="Undo" disabled={!undoStack.length} onClick={undo}><Undo2 size={18} /></button><button className="studio-icon" title="Redo (Ctrl Shift Z)" aria-label="Redo" disabled={!redoStack.length} onClick={redo}><Redo2 size={18} /></button></div>
      <button className="studio-command" aria-label="Find a command" onClick={onCommands}><Search size={16} /><span>Find a command</span><kbd>Ctrl K</kbd></button>
      <div className="studio-secondary-controls"><div className="studio-mode" role="group" aria-label="Workspace mode"><button aria-pressed={document.workspaceMode === 'simple'} className={document.workspaceMode === 'simple' ? 'active' : ''} onClick={() => dispatch({ type: 'set-workspace-mode', mode: 'simple' })}>Simple</button><button aria-pressed={document.workspaceMode === 'pro'} className={document.workspaceMode === 'pro' ? 'active' : ''} onClick={() => dispatch({ type: 'set-workspace-mode', mode: 'pro' })}>Pro</button></div>
      <button className="studio-generate" aria-label="Generate a model" onClick={onOpenGenerate}><Sparkles size={17} /><span>Generate</span></button>
      <div className="studio-utilities"><ThemeToggle theme={theme} onToggle={onToggleTheme} /><button className="studio-icon" title="Getting started and shortcuts (?)" aria-label="Getting started and shortcuts" onClick={onHelp}><CircleHelp size={19} /></button></div>
      <button className="studio-primary" onClick={() => onExportChange(true)}><Download size={17} /> Export</button></div>
    </header>
    {menuOpen && <WorkspaceDialog title="Your project" description="Manage this model and keep a copy of your work." onClose={() => setMenuOpen(false)} className="project-dialog">
      <div className="project-action-list"><button onClick={() => action(onOpenProjects)}><FolderOpen size={19} /><span><strong>My projects</strong><small>Return to your workshop</small></span></button><button onClick={() => action(newDocument)}><FilePlus2 size={19} /><span><strong>New project</strong><small>Your current work stays in Projects</small></span></button><button onClick={() => action(onImport)}><FolderOpen size={19} /><span><strong>Import project or mesh</strong><small>FORGE, STL, OBJ, GLB, or GLTF</small></span></button><button onClick={() => action(() => { setFormat('project'); onExportChange(true) })}><Save size={19} /><span><strong>Download an editable backup</strong><small>Save a separate .forge.json file</small></span></button><button onClick={() => action(onOpenCommunity)}><Users size={19} /><span><strong>Explore community</strong><small>Discover models and inspiration</small></span></button></div>
      <div className="checkpoint-control"><label htmlFor="checkpoint-name"><History size={17} /> Save a checkpoint</label><p>Restore a previous version from the History tab.</p><div><input id="checkpoint-name" placeholder="Optional name, e.g. before carving" value={checkpointName} onChange={(event) => setCheckpointName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !checkpointBusy) void createCheckpoint() }} /><button className="studio-secondary" disabled={checkpointBusy} onClick={() => void createCheckpoint()}>{checkpointBusy ? 'Saving…' : 'Save'}</button></div>{checkpointFeedback && <p role="status">{checkpointFeedback}</p>}</div>
      <p className="local-storage-note"><HardDrive size={16} /> Projects and checkpoints are saved in this browser on this device.</p>
    </WorkspaceDialog>}
    {exportOpen && <WorkspaceDialog title="Take your idea with you." description={`Export “${document.name || 'Untitled project'}” for printing, sharing, or safekeeping.`} onClose={() => onExportChange(false)} className="export-dialog">
      <div className="export-formats" role="group" aria-label="Export format">{formats.map((item) => <button key={item.id} aria-pressed={format === item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><span className="format-check">{format === item.id && <Check size={14} />}</span><div><strong>{item.title}</strong><p>{item.description}</p></div>{item.tag && <em>{item.tag}</em>}</button>)}</div>
      {!canExport && <p className="export-warning" role="status">{format === 'ams' && multiColorUnsupported ? 'Choose standard 3MF to preserve holes, intersections, hulls, sculpting, and surface modifiers. Multi-color export supports separate solid parts.' : placingNodeId ? 'Finish placing your shape, or press Escape in the canvas to cancel, before exporting.' : geometryStatus === 'building' || meshDocument !== document ? 'Your model is rebuilding. Export will be available when it is ready.' : 'Create a valid solid to export a mesh, or choose Editable backup to save your project.'}</p>}
      {exportError && <p className="export-warning" role="alert">{exportError}</p>}<footer className="dialog-footer"><span>{format === 'project' ? 'Your editable model, saved as a file.' : 'Check the Print tab before sending to a slicer.'}</span><button className="studio-primary" disabled={!canExport || exporting} onClick={() => void download()}><Download size={17} />{exporting ? 'Preparing…' : 'Download file'}</button></footer>
    </WorkspaceDialog>}
  </>
}
