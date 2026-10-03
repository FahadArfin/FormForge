import { ArrowLeft, ChevronDown, Check, Download, FilePlus2, FolderOpen, History, LoaderCircle, Redo2, Save, Search, Sparkles, Undo2, Users, CircleHelp, HardDrive, AlertCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '@/store/editor'
import { downloadBlob, safeFilename } from '@/lib/download'
import { export3mf, exportGlb, exportMultiColor3mf, exportObj, exportStl } from '@/lib/exporters'
import { saveVersion } from '@/lib/db'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'
import { WorkspaceDialog } from './WorkspaceDialog'
import { getPrintReadiness } from '@/lib/printReadiness'
import { createExportDocument } from '@/lib/exportScope'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'

export function TopBar({ theme, onToggleTheme, onNewProject, onOpenProjects, onOpenCommunity, onOpenGenerate, onImport, onCommands, onHelp, exportOpen, onExportChange }: {
  theme: AppearanceTheme; onToggleTheme: () => void; onOpenProjects: () => void; onOpenCommunity: () => void; onOpenGenerate: () => void;
  onNewProject: () => void; onImport: () => void; onCommands: () => void; onHelp: () => void; exportOpen: boolean; onExportChange: (open: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [format, setFormat] = useState('3mf')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [downloadRequested, setDownloadRequested] = useState(false)
  const [scope, setScope] = useState<'document' | 'selection'>('document')
  const dialogOpen = useRef(exportOpen)
  const exportGeneration = useRef(0)
  const exportAbort = useRef<AbortController | null>(null)
  dialogOpen.current = exportOpen
  const [checkpointName, setCheckpointName] = useState('')
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [checkpointFeedback, setCheckpointFeedback] = useState('')
  const document = useEditor((state) => state.document)
  const selectedNodeIds = useEditor(state => state.selectedNodeIds)
  const selectedScope = useMemo(() => {
    try { return { document: createExportDocument(document, selectedNodeIds), error: '' } }
    catch (cause) { return { document: null, error: cause instanceof Error ? cause.message : 'Choose a printable selection.' } }
  }, [document, selectedNodeIds])
  const [projectName, setProjectName] = useState(document.name)
  useEffect(() => setProjectName(document.name), [document.name, document.id])
  useEffect(() => { exportGeneration.current++; exportAbort.current?.abort(); setDownloadRequested(false); setExportError('') }, [exportOpen, format, scope, document, selectedNodeIds])
  useEffect(() => () => { exportGeneration.current++; exportAbort.current?.abort() }, [])
  useEffect(() => {
    const requestedFormat = (event: Event) => { if ((event as CustomEvent<{ format?: string }>).detail?.format === 'project') setFormat('project') }
    window.addEventListener('formforge:open-export', requestedFormat)
    return () => window.removeEventListener('formforge:open-export', requestedFormat)
  }, [])
  const mesh = useEditor((state) => state.mesh)
  const meshDocument = useEditor((state) => state.meshDocument)
  const placingNodeId = useEditor((state) => state.placingNodeId)
  const geometryStatus = useEditor((state) => state.geometryStatus)
  const geometryError = useEditor((state) => state.geometryError)
  const analysis = useEditor((state) => state.analysis)
  const undoStack = useEditor((state) => state.undoStack)
  const redoStack = useEditor((state) => state.redoStack)
  const dispatch = useEditor((state) => state.dispatch)
  const undo = useEditor((state) => state.undo)
  const redo = useEditor((state) => state.redo)
  const setNotice = useEditor((state) => state.setNotice)
  const saveStatus = useEditor((state) => state.saveStatus)
  const saveError = useEditor((state) => state.saveError)
  const saveNow = useEditor((state) => state.saveNow)
  const readiness = getPrintReadiness({ document, meshDocument, analysis, geometryStatus, geometryError, placingNodeId })
  const meshReady = readiness.canExportMesh && Boolean(mesh?.triangleCount)
  const reviewPrint = () => { onExportChange(false); window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'print' } })) }
  const formats = [
    { id: '3mf', title: '3MF', description: 'Recommended for 3D printing. Includes units.', tag: 'Recommended' },
    { id: 'stl', title: 'STL', description: 'Universal compatibility with 3D slicers.' },
    { id: 'project', title: 'Editable backup', description: 'Keep shapes, parameters, and your project editable.', tag: '.forge.json' },
    { id: 'glb', title: 'GLB', description: 'A compact 3D mesh for the web and other apps.' },
    { id: 'obj', title: 'OBJ', description: 'An evaluated mesh for other modeling tools.' },
    { id: 'ams', title: 'Multi-color 3MF', description: 'Per-part material slots for multi-color printing.' },
  ]
  const exportDocument = scope === 'selection' ? selectedScope.document : document
  const multiColorUnsupported = Boolean(exportDocument && (exportDocument.sculptStrokes.length > 0 || exportDocument.nodes.some((node) => !node.suppressed && (node.boolean !== 'add' || node.groupOperation === 'hull' || Object.values(node.surface ?? {}).some((value) => value > 0)))))
  const canExport = format === 'project' || (!placingNodeId && (scope === 'selection' ? Boolean(exportDocument) : meshReady) && (format !== 'ams' || !multiColorUnsupported))
  const download = async () => {
    if (!canExport || exporting) return
    setExporting(true)
    setExportError('')
    try {
      const snapshot = document
      const generation = exportGeneration.current
      const controller = new AbortController()
      exportAbort.current = controller
      const selection = JSON.stringify(selectedNodeIds)
      const assertCurrent = () => {
        if (generation !== exportGeneration.current || useEditor.getState().document !== snapshot || !dialogOpen.current || (scope === 'selection' && JSON.stringify(useEditor.getState().selectedNodeIds) !== selection)) throw new Error('The project, selection, or export dialog changed. Choose your export again.')
      }
      const filename = safeFilename(document.name + (scope === 'selection' && format !== 'project' ? '-selection' : ''))
      if (format === 'project') downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), `${filename}.forge.json`)
      else if (format === 'ams' && exportDocument) downloadBlob(exportMultiColor3mf(exportDocument.nodes, document.name), `${filename}-ams.3mf`)
      else if (exportDocument) {
        const exportedMesh = scope === 'selection' ? await evaluateSnapshot(exportDocument, controller.signal) : mesh
        assertCurrent()
        if (!exportedMesh?.triangleCount) throw new Error('This export contains no solid geometry. Include the solid and its intended holes.')
        const blob = format === 'stl' ? exportStl(exportedMesh) : format === '3mf' ? export3mf(exportedMesh, document.name) : format === 'glb' ? await exportGlb(exportedMesh) : exportObj(exportedMesh)
        assertCurrent()
        downloadBlob(blob, `${filename}.${format}`)
      }
      setDownloadRequested(true)
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
      <div className="studio-project"><div><input className="studio-project-name" value={projectName} aria-label="Project name" onChange={(event) => setProjectName(event.target.value)} onBlur={() => { const name = projectName.trim() || 'Untitled project'; setProjectName(name); if (name !== document.name) dispatch({ type: 'rename-document', name }) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setProjectName(document.name) } }} /><button className="studio-icon" title="Project actions" aria-label="Project actions" onClick={() => setMenuOpen(true)}><ChevronDown size={16} /></button></div>
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
      <div className="project-action-list"><button onClick={() => action(onOpenProjects)}><FolderOpen size={19} /><span><strong>My projects</strong><small>Return to your workshop</small></span></button><button onClick={() => action(onNewProject)}><FilePlus2 size={19} /><span><strong>New project</strong><small>Save this project before starting another</small></span></button><button onClick={() => action(onImport)}><FolderOpen size={19} /><span><strong>Import project or mesh</strong><small>FORGE, STL, OBJ, GLB, or self-contained GLTF</small></span></button><button onClick={() => action(() => { setFormat('project'); onExportChange(true) })}><Save size={19} /><span><strong>Download an editable backup</strong><small>Save a separate .forge.json file</small></span></button><button onClick={() => action(onOpenCommunity)}><Users size={19} /><span><strong>Explore community</strong><small>Discover models and inspiration</small></span></button></div>
      <div className="checkpoint-control"><label htmlFor="checkpoint-name"><History size={17} /> Save a checkpoint</label><p>Restore a previous version from the History tab.</p><div><input id="checkpoint-name" placeholder="Optional name, e.g. before carving" value={checkpointName} onChange={(event) => setCheckpointName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !checkpointBusy) void createCheckpoint() }} /><button className="studio-secondary" disabled={checkpointBusy} onClick={() => void createCheckpoint()}>{checkpointBusy ? 'Saving…' : 'Save'}</button></div>{checkpointFeedback && <p role="status">{checkpointFeedback}</p>}</div>
      <p className="local-storage-note"><HardDrive size={16} /> Projects and checkpoints are saved in this browser on this device.</p>
    </WorkspaceDialog>}
    {exportOpen && <WorkspaceDialog title="Take your idea with you." description={`Export “${document.name || 'Untitled project'}” for printing, sharing, or safekeeping.`} onClose={() => onExportChange(false)} className="export-dialog">
      <div className={`export-readiness ${readiness.status}`}><div><strong>{readiness.title}</strong><p>{readiness.analysis ? `${readiness.analysis.dimensions.x.toFixed(1)} × ${readiness.analysis.dimensions.y.toFixed(1)} × ${readiness.analysis.dimensions.z.toFixed(1)} mm · ${document.printer.name}` : readiness.message}</p></div><button className="studio-secondary" onClick={reviewPrint}>Review print checks</button></div>
      <label className="cad-select-label">Export scope<select aria-label="Export scope" value={scope} disabled={format === 'project' || exporting} onChange={event => setScope(event.target.value as 'document' | 'selection')}><option value="document">Complete model</option><option value="selection">Selected shapes and combined groups</option></select></label>
      <p className="export-scope-note">{format === 'project' ? 'Editable backup always includes the complete project.' : scope === 'selection' ? 'Combined groups stay together. Select any ungrouped holes you want included. Hide only changes the view; Suppress removes a modeling step.' : 'All enabled modeling steps are included, even shapes hidden in the viewport.'}</p>
      <div className="export-formats" role="group" aria-label="Export format">{formats.map((item) => <button disabled={exporting} key={item.id} aria-pressed={format === item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><span className="format-check">{format === item.id && <Check size={14} />}</span><div><strong>{item.title}</strong><p>{item.description}</p></div>{item.tag && <em>{item.tag}</em>}</button>)}</div>
      {!canExport && <p className="export-warning" role="status">{scope === 'selection' && selectedScope.error ? selectedScope.error : format === 'ams' && multiColorUnsupported ? 'Choose standard 3MF to preserve holes, intersections, hulls, sculpting, and surface modifiers. Multi-color export supports separate solid parts.' : readiness.message}</p>}
      {exportError && <p className="export-warning" role="alert">{exportError}</p>}{downloadRequested && <p className="download-confirmation" role="status">Download requested. Check your browser’s downloads. If no file appears, allow downloads or try a full browser window.</p>}<footer className="dialog-footer"><span>{format === 'project' ? 'Your editable model, saved as a file.' : 'Review supports, layers, and strength in your slicer before printing.'}</span><button className="studio-primary" disabled={!canExport || exporting} onClick={() => void download()}><Download size={17} />{exporting ? 'Preparing…' : downloadRequested ? 'Download again' : 'Download file'}</button></footer>
    </WorkspaceDialog>}
  </>
}
