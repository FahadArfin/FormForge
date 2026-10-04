import { ExportDialog } from './ExportDialog'
import { ArrowLeft, ChevronDown, Check, Download, FilePlus2, FolderOpen, History, LoaderCircle, Redo2, Save, Search, Sparkles, Undo2, Users, CircleHelp, HardDrive, AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useEditor } from '@/store/editor'
import { saveVersion } from '@/lib/db'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'
import { WorkspaceDialog } from './WorkspaceDialog'

export function TopBar({ theme, onToggleTheme, onNewProject, onOpenProjects, onOpenCommunity, onOpenGenerate, onImport, onCommands, onHelp, exportOpen, onExportChange }: {
  theme: AppearanceTheme; onToggleTheme: () => void; onOpenProjects: () => void; onOpenCommunity: () => void; onOpenGenerate: () => void;
  onNewProject: () => void; onImport: () => void; onCommands: () => void; onHelp: () => void; exportOpen: boolean; onExportChange: (open: boolean) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [format, setFormat] = useState('3mf')
  const [arrange, setArrange] = useState(false)
  const [checkpointName, setCheckpointName] = useState('')
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [checkpointFeedback, setCheckpointFeedback] = useState('')
  const document = useEditor((state) => state.document)
  const [projectName, setProjectName] = useState(document.name)
  useEffect(() => setProjectName(document.name), [document.name, document.id])
  useEffect(() => {
    const requestedFormat = (event: Event) => {
      const detail = (event as CustomEvent<{ format?: string; arrange?: boolean }>).detail
      setFormat(detail?.format === 'project' ? 'project' : '3mf')
      setArrange(detail?.arrange === true)
    }
    window.addEventListener('formforge:open-export', requestedFormat)
    return () => window.removeEventListener('formforge:open-export', requestedFormat)
  }, [])
  const undoStack = useEditor((state) => state.undoStack)
  const redoStack = useEditor((state) => state.redoStack)
  const dispatch = useEditor((state) => state.dispatch)
  const undo = useEditor((state) => state.undo)
  const redo = useEditor((state) => state.redo)
  const setNotice = useEditor((state) => state.setNotice)
  const saveStatus = useEditor((state) => state.saveStatus)
  const saveError = useEditor((state) => state.saveError)
  const saveNow = useEditor((state) => state.saveNow)
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
      <button className="studio-primary" onClick={() => { setFormat('3mf'); setArrange(false); onExportChange(true) }}><Download size={17} /> Export</button></div>
    </header>
    {menuOpen && <WorkspaceDialog title="Your project" description="Manage this model and keep a copy of your work." onClose={() => setMenuOpen(false)} className="project-dialog">
      <div className="project-action-list"><button onClick={()=>action(()=>window.dispatchEvent(new Event('formforge:open-cloud')))}><Users size={19}/><span><strong>Cloud & review</strong><small>Private snapshots and shared feedback</small></span></button><button onClick={() => action(onOpenProjects)}><FolderOpen size={19} /><span><strong>My projects</strong><small>Return to your workshop</small></span></button><button onClick={() => action(onNewProject)}><FilePlus2 size={19} /><span><strong>New project</strong><small>Save this project before starting another</small></span></button><button onClick={() => action(onImport)}><FolderOpen size={19} /><span><strong>Import project or mesh</strong><small>FORGE, 3MF, STL, OBJ, GLB, or self-contained GLTF</small></span></button><button onClick={() => action(() => { setFormat('project'); onExportChange(true) })}><Save size={19} /><span><strong>Download an editable backup</strong><small>Save a separate .forge.json file</small></span></button><button onClick={() => action(onOpenCommunity)}><Users size={19} /><span><strong>Explore community</strong><small>Discover models and inspiration</small></span></button></div>
      <div className="checkpoint-control"><label htmlFor="checkpoint-name"><History size={17} /> Save a checkpoint</label><p>Restore a previous version from the History tab.</p><div><input id="checkpoint-name" placeholder="Optional name, e.g. before carving" value={checkpointName} onChange={(event) => setCheckpointName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !checkpointBusy) void createCheckpoint() }} /><button className="studio-secondary" disabled={checkpointBusy} onClick={() => void createCheckpoint()}>{checkpointBusy ? 'Saving…' : 'Save'}</button></div>{checkpointFeedback && <p role="status">{checkpointFeedback}</p>}</div>
      <p className="local-storage-note"><HardDrive size={16} /> Projects and checkpoints are saved in this browser on this device.</p>
    </WorkspaceDialog>}
    {exportOpen && <ExportDialog initialFormat={format} initialArrange={arrange} onClose={()=>{onExportChange(false);setFormat('3mf');setArrange(false)}}/>}
  </>
}
