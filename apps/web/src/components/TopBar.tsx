import { ChevronDown, Cloud, Download, FilePlus2, FolderOpen, Grid3X3, History, Redo2, Save, Sparkles, Undo2, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { useEditor } from '@/store/editor'
import { downloadBlob, safeFilename } from '@/lib/download'
import { export3mf, exportGlb, exportMultiColor3mf, exportObj, exportStl } from '@/lib/exporters'
import { importMeshFile } from '@/lib/importers'
import { saveProject, saveVersion } from '@/lib/db'
import { IconButton } from './IconButton'
import { ThemeToggle, type AppearanceTheme } from './ThemeToggle'

export function TopBar({ theme, onToggleTheme, onOpenProjects, onOpenCommunity, onOpenGenerate }: { theme: AppearanceTheme; onToggleTheme: () => void; onOpenProjects: () => void; onOpenCommunity: () => void; onOpenGenerate: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const document = useEditor((state) => state.document)
  const mesh = useEditor((state) => state.mesh)
  const showGrid = useEditor((state) => state.showGrid)
  const undoStack = useEditor((state) => state.undoStack)
  const redoStack = useEditor((state) => state.redoStack)
  const dispatch = useEditor((state) => state.dispatch)
  const undo = useEditor((state) => state.undo)
  const redo = useEditor((state) => state.redo)
  const newDocument = useEditor((state) => state.newDocument)
  const loadDemo = useEditor((state) => state.loadDemo)
  const importDocument = useEditor((state) => state.importDocument)
  const importMesh = useEditor((state) => state.importMesh)
  const setShowGrid = useEditor((state) => state.setShowGrid)
  const setNotice = useEditor((state) => state.setNotice)

  const exportMesh = async (format: 'stl' | '3mf' | 'obj' | 'glb') => {
    if (!mesh?.triangleCount) { setNotice('Nothing printable to export yet.'); return }
    const filename = safeFilename(document.name)
    const blob = format === 'stl' ? exportStl(mesh) : format === '3mf' ? export3mf(mesh, document.name) : format === 'glb' ? await exportGlb(mesh) : exportObj(mesh)
    downloadBlob(blob, `${filename}.${format}`)
    setNotice(`${format.toUpperCase()} exported.`)
    setMenuOpen(false)
  }

  const exportProject = () => {
    downloadBlob(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }), `${safeFilename(document.name)}.forge.json`)
    setNotice('Editable project exported.')
    setMenuOpen(false)
  }

  const exportAms = () => {
    try {
      downloadBlob(exportMultiColor3mf(document.nodes, document.name), `${safeFilename(document.name)}-ams.3mf`)
      setNotice('AMS multi-material 3MF exported with per-part slots.')
      setMenuOpen(false)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Multi-color export failed.') }
  }

  const createCheckpoint = async () => {
    await saveVersion(document)
    window.dispatchEvent(new Event('formforge:version-saved'))
    setNotice('Checkpoint saved to local history.')
    setMenuOpen(false)
  }

  const saveNow = async () => {
    await saveProject(document)
    setNotice(`“${document.name || 'Untitled project'}” saved to Projects.`)
  }

  return (
    <header className="topbar">
      <button className="brand brand-button" aria-label="Open projects" onClick={onOpenProjects}><span className="brand-mark"><span /></span><strong>FormForge</strong><em>alpha</em></button>
      <div className="project-controls">
        <button className="file-menu-button" onClick={() => setMenuOpen(!menuOpen)}><span>File</span><ChevronDown size={14} /></button>
        {menuOpen && <div className="file-menu popover">
          <button onClick={() => { newDocument(); setMenuOpen(false) }}><FilePlus2 size={16} /> New project</button>
          <button onClick={() => { loadDemo(); setMenuOpen(false) }}><FolderOpen size={16} /> Load demo</button>
          <button onClick={() => fileRef.current?.click()}><FolderOpen size={16} /> Import project or mesh</button>
          <button onClick={() => void createCheckpoint()}><History size={16} /> Save checkpoint</button>
          <div className="menu-divider" />
          <button onClick={exportProject}><Save size={16} /> Editable project</button>
          <button onClick={() => exportMesh('3mf')}><Download size={16} /> Print-ready 3MF</button>
          <button onClick={exportAms}><Download size={16} /> AMS multi-color 3MF</button>
          <button onClick={() => exportMesh('stl')}><Download size={16} /> Binary STL</button>
          <button onClick={() => exportMesh('obj')}><Download size={16} /> OBJ mesh</button>
          <button onClick={() => exportMesh('glb')}><Download size={16} /> GLB scene</button>
        </div>}
        <input ref={fileRef} hidden type="file" accept=".json,.forge.json,.stl,.obj,.glb,.gltf" onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          try {
            if (file.name.toLowerCase().endsWith('.json')) importDocument(JSON.parse(await file.text()))
            else importMesh(file.name.replace(/\.[^.]+$/, ''), await importMeshFile(file))
          } catch (error) { setNotice(error instanceof Error ? error.message : 'That file could not be opened.') }
          event.target.value = ''
          setMenuOpen(false)
        }} />
        <input className="project-name" value={document.name} aria-label="Project name" onChange={(event) => dispatch({ type: 'rename-document', name: event.target.value })} />
        <button className="save-state save-state-button" onClick={() => void saveNow()}><Cloud size={14} /><span>Save project</span></button>
      </div>
      <div className="history-controls">
        <IconButton compact icon={<Undo2 size={18} />} label="Undo" disabled={!undoStack.length} onClick={undo} />
        <IconButton compact icon={<Redo2 size={18} />} label="Redo" disabled={!redoStack.length} onClick={redo} />
        <IconButton compact active={showGrid} icon={<Grid3X3 size={18} />} label="Toggle grid" onClick={() => setShowGrid(!showGrid)} />
      </div>
      <button className="community-top-link" onClick={onOpenCommunity}><Users size={16} /> Community</button>
      <button className="generate-top-link" onClick={onOpenGenerate}><Sparkles size={16} /> Generate</button>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <div className="mode-switch" role="group" aria-label="Workspace mode">
        <button className={document.workspaceMode === 'simple' ? 'active' : ''} onClick={() => dispatch({ type: 'set-workspace-mode', mode: 'simple' })}>Simple</button>
        <button className={document.workspaceMode === 'pro' ? 'active' : ''} onClick={() => dispatch({ type: 'set-workspace-mode', mode: 'pro' })}>Pro</button>
      </div>
      <button className="export-button" onClick={() => exportMesh('3mf')}><Download size={17} /> Export 3MF</button>
    </header>
  )
}
