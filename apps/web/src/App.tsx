import { templateCatalog, type StarterId } from './lib/templateCatalog'
import { useMobilePanel } from './lib/useMobilePanel'
import { BuildProgress } from './components/BuildProgress'
import { SelectionDimensions } from './components/SelectionDimensions'
import type { ImportMesh } from './lib/importReview'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BoxSelect, Eye, EyeOff, MousePointerClick, X, Box, CircleHelp, PanelLeft, PanelRight } from 'lucide-react'
import { parseModelDocument } from '@formforge/model'
import { Toolbox } from './components/Toolbox'
import { Inspector } from './components/Inspector'
import { TopBar } from './components/TopBar'
import { ProjectsHome } from './components/ProjectsHome'
import type { AppearanceTheme } from './components/ThemeToggle'
import { StatusBar } from './components/StatusBar'
import { ViewportTools } from './components/ViewportTools'
import type { CommunityModel } from './lib/community'
import { markProjectPublic } from './lib/db'
import { useEditor } from './store/editor'
import { importMeshFile } from './lib/importers'
import { WorkspaceHelp } from './components/WorkspaceHelp'
import { CommandMenu } from './components/CommandMenu'
import { WorkspaceDialog } from './components/WorkspaceDialog'
import { downloadBlob, safeFilename } from './lib/download'
import type { CloudLink } from './components/CloudWorkspace'
import { saveBeforeReplace } from './lib/saveBeforeReplace'

const Community = lazy(() => import('./components/Community').then((module) => ({ default: module.Community })))
const GenerateStudio = lazy(() => import('./components/GenerateStudio').then((module) => ({ default: module.GenerateStudio })))
const RecoveryDialog = lazy(() => import('./components/RecoveryDialog').then(module=>({default:module.RecoveryDialog})))
const StarterDialog = lazy(() => import('./components/StarterDialog').then(module=>({default:module.StarterDialog})))
const ImportReview = lazy(() => import('./components/ImportReview').then(module=>({default:module.ImportReview})))
const CloudWorkspace = lazy(() => import('./components/CloudWorkspace').then(module=>({default:module.CloudWorkspace})))
const Viewport = lazy(() => import('./components/Viewport').then(module=>({default:module.Viewport})))
const requestedStarter = (): StarterId | undefined => {
  if (window.location.hash.split('?')[0] !== '#studio') return
  const id = new URLSearchParams(window.location.hash.split('?')[1]).get('starter')
  return templateCatalog.find(item=>item.id===id)?.id
}

type Area = 'projects' | 'studio' | 'community'
const readArea = (): Area => window.location.hash.split('?')[0] === '#studio' ? 'studio' : window.location.hash.split('?')[0] === '#community' ? 'community' : 'projects'
const readTheme = (): AppearanceTheme => { try { return localStorage.getItem('formforge-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' } }

export function App({ active = true }: { active?: boolean }) {
  const [theme, setTheme] = useState<AppearanceTheme>(readTheme)
  const [area, updateArea] = useState<Area>(readArea)
  const setArea = (next: Area) => { updateArea(next); if (window.location.hash !== `#${next}`) window.location.hash = next }
  const [cloudOpen,setCloudOpen]=useState(()=>window.location.hash.includes('review='))
  const [cloudLink,setCloudLink]=useState<CloudLink|null>(null)
  const [starterId,setStarterId]=useState<StarterId|undefined>(requestedStarter)
  const [startersOpen,setStartersOpen]=useState(()=>!!requestedStarter())
  const [recoveryOpen,setRecoveryOpen]=useState(false)
  const recoveryGeneration=useRef(0)
  const starterGeneration=useRef(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'tools' | 'inspector' | null>(null)
  useMobilePanel(active && area === 'studio' ? mobilePanel : null, () => setMobilePanel(null))
  const fileRef = useRef<HTMLInputElement>(null)
  const importAsNew = useRef(false)
  const importGeneration = useRef(0)
  const [importReview, setImportReview] = useState<{name:string;mesh:ImportMesh;confirm:(mesh:ImportMesh)=>Promise<void>} | null>(null)
  const [publishRequest, setPublishRequest] = useState(0)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [saveBlocked, setSaveBlocked] = useState(false)
  const [retryingSave, setRetryingSave] = useState(false)
  const pendingNavigation = useRef<{ action: () => void; isCurrent: () => boolean } | null>(null)
  const hydrate = useEditor((state) => state.hydrate)
  const hydrated = useEditor((state) => state.hydrated)
  const notice = useEditor((state) => state.notice)
  const setNotice = useEditor((state) => state.setNotice)
  const showResult = useEditor((state) => state.showResult)
  const setShowResult = useEditor((state) => state.setShowResult)
  const geometryBusyVisible = useEditor((state) => state.geometryBusyVisible)
  const geometryError = useEditor((state) => state.geometryError)
  const tool = useEditor((state) => state.tool)
  const undo = useEditor((state) => state.undo)
  const redo = useEditor((state) => state.redo)
  const removeSelected = useEditor((state) => state.removeSelected)
  const duplicateSelected = useEditor((state) => state.duplicateSelected)
  const cancelPlacement = useEditor((state) => state.cancelPlacement)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const document = useEditor((state) => state.document)
  const translateSelection = useEditor((state) => state.translateSelection)
  const selectAll = useEditor((state) => state.selectAll)
  const translationSnap = useEditor((state) => state.translationSnap)
  const setBrushSetting = useEditor((state) => state.setBrushSetting)
  const brushRadius = useEditor((state) => state.brushRadius)
  const setTool = useEditor((state) => state.setTool)
  const importDocument = useEditor((state) => state.importDocument)
  const newDocument = useEditor((state) => state.newDocument)
  const meshComponentMode = useEditor((state) => state.meshComponentMode)
  const setMeshComponentMode = useEditor((state) => state.setMeshComponentMode)
  const clearMeshComponentSelection = useEditor((state) => state.clearMeshComponentSelection)
  const translateMeshComponents = useEditor((state) => state.translateMeshComponents)
  const deleteSelectedMeshComponents = useEditor((state) => state.deleteSelectedMeshComponents)
  const saveNow = useEditor((state) => state.saveNow)
  const addPrimitive = useEditor((state) => state.addPrimitive)
  const openImport = (asNew = false) => { importAsNew.current = asNew; fileRef.current?.click() }
  const safelyContinue = async (action: () => void, isCurrent = () => true) => {
    const outcome = await saveBeforeReplace(() => useEditor.getState().document, saveNow, action, isCurrent)
    if (outcome === 'failed') { pendingNavigation.current = { action, isCurrent }; setSaveBlocked(true) }
    if (outcome === 'changed') setNotice('Your project changed while saving. Please try that action again.')
    return outcome === 'continued'
  }
  const openProjects = () => safelyContinue(() => setArea('projects'))
  const createProject = () => void safelyContinue(() => { newDocument(); setArea('studio') })
  const startExample = () => {starterGeneration.current++;setHelpOpen(false);setStartersOpen(true)}

  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => { if (active) window.document.title = area === 'studio' ? `${document.name || 'Untitled project'} · FormForge` : area === 'community' ? 'Community · FormForge' : 'Your workshop · FormForge' }, [active, area, document.name])
  useEffect(() => { const onHash = () => {
    updateArea(readArea())
    const id=requestedStarter();setStarterId(id)
    starterGeneration.current++;setStartersOpen(!!id)
    if (['', '#home', '#templates'].includes(window.location.hash.split('?')[0]!)) {
      setCloudOpen(false);setHelpOpen(false);setRecoveryOpen(false);setImportReview(null)
      recoveryGeneration.current++;importGeneration.current++
    }
  }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash) }, [])
  useEffect(() => { setCommandsOpen(false); setGenerateOpen(false); setExportOpen(false); setMobilePanel(null) }, [area])
  useEffect(() => {
    const openInspector = () => { if (window.innerWidth <= 980) setMobilePanel('inspector') }
    const openStarters=()=>{starterGeneration.current++;setStartersOpen(true)}
    window.addEventListener('formforge:starters',openStarters)
    const openCloud = () => setCloudOpen(true)
    const openRecovery = () => {recoveryGeneration.current++;setRecoveryOpen(true)}
    window.addEventListener('formforge:recovery',openRecovery)
    window.addEventListener('formforge:open-cloud',openCloud)
    const openExport = () => { setMobilePanel(null); setExportOpen(true) }
    window.addEventListener('formforge:open-inspector', openInspector)
    window.addEventListener('formforge:open-export', openExport)
    return () => { window.removeEventListener('formforge:recovery',openRecovery);window.removeEventListener('formforge:starters',openStarters);window.removeEventListener('formforge:open-cloud',openCloud); window.removeEventListener('formforge:open-inspector', openInspector); window.removeEventListener('formforge:open-export', openExport) }
  }, [])
  useEffect(() => { if (['place','draw-profile','pick-workplane','place-face','measure-angle','measure'].includes(tool)) setMobilePanel(null) }, [tool])
  useEffect(() => {
    const protectUnsavedWork = (event: BeforeUnloadEvent) => { if (useEditor.getState().saveStatus !== 'saved') { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protectUnsavedWork)
    const flush = () => {const s=useEditor.getState();if(s.hydrated&&s.saveStatus!=='saved')void s.saveNow()}
    const onHidden = () => {if(window.document.visibilityState==='hidden')flush()}
    window.addEventListener('pagehide',flush)
    window.document.addEventListener('visibilitychange',onHidden)
    return () => {window.removeEventListener('beforeunload', protectUnsavedWork);window.removeEventListener('pagehide',flush);window.document.removeEventListener('visibilitychange',onHidden)}
  }, [])

  useEffect(() => {
    window.document.documentElement.dataset.theme = theme
    window.document.documentElement.style.colorScheme = theme
    window.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f8fb' : '#12131a')
    try { localStorage.setItem('formforge-theme', theme) } catch { /* Theme still applies for this visit. */ }
  }, [theme])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (!active || area !== 'studio' || window.document.querySelector('dialog[open]') || generateOpen) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); return }
      if (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandsOpen(true); return }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); return }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const shortcuts = { v: 'select', g: 'move', r: 'rotate', s: 'scale' } as const
        const nextTool = shortcuts[event.key.toLowerCase() as keyof typeof shortcuts]
        if (nextTool && tool !== 'place' && tool !== 'draw-profile') { event.preventDefault(); setTool(nextTool); return }
        if (event.key.toLowerCase() === 'f') { event.preventDefault(); window.dispatchEvent(new CustomEvent('formforge:frame', { detail: { selectedOnly: event.shiftKey } })); return }
        if (event.key === '?') { event.preventDefault(); setHelpOpen(true); return }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected() }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        if (meshComponentMode === 'object') removeSelected()
        else deleteSelectedMeshComponents()
      }
      if (event.key === 'Escape') {
        cancelPlacement()
        if (['pick-workplane','place-face','measure-angle'].includes(tool)) setTool('select')
        if (meshComponentMode !== 'object') clearMeshComponentSelection()
        if (tool === 'draw-profile') window.dispatchEvent(new Event('formforge:cancel-sketch'))
        if (tool !== 'place' && tool !== 'draw-profile' && meshComponentMode === 'object') useEditor.getState().selectNode(null)
        setMobilePanel(null)
      }
      if (!event.ctrlKey && !event.metaKey && selectedNodeId && ['1', '2', '3', '4'].includes(event.key)) {
        setMeshComponentMode(event.key === '1' ? 'vertex' : event.key === '2' ? 'edge' : event.key === '3' ? 'face' : 'object')
      }
      if (event.key === 'Enter' && tool === 'draw-profile') window.dispatchEvent(new Event('formforge:finish-sketch'))
      if (event.key === '[') setBrushSetting({ brushRadius: Math.max(0.5, brushRadius - 0.5) })
      if (event.key === ']') setBrushSetting({ brushRadius: Math.min(24, brushRadius + 0.5) })
      if (selectedNodeId && !target.closest('button, a, summary, [role="slider"], [role="button"], .sketch-canvas') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
        event.preventDefault()
        const baseStep = translationSnap ?? 0.1
        const step = baseStep * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1)
        if (meshComponentMode !== 'object') {
          const delta = { x: 0, y: 0, z: 0 }
          if (event.key === 'ArrowLeft') delta.x -= step
          if (event.key === 'ArrowRight') delta.x += step
          if (event.key === 'ArrowUp') delta.y += step
          if (event.key === 'ArrowDown') delta.y -= step
          if (event.key === 'PageUp') delta.z += step
          if (event.key === 'PageDown') delta.z -= step
          translateMeshComponents(delta)
          return
        }
        const delta = { x: 0, y: 0, z: 0 }
        if (event.key === 'ArrowLeft') delta.x -= step
        if (event.key === 'ArrowRight') delta.x += step
        if (event.key === 'ArrowUp') delta.y += step
        if (event.key === 'ArrowDown') delta.y -= step
        if (event.key === 'PageUp') delta.z += step
        if (event.key === 'PageDown') delta.z -= step
        translateSelection(delta)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, area, generateOpen, saveNow, undo, redo, removeSelected, duplicateSelected, cancelPlacement, selectedNodeId, translateSelection, selectAll, translationSnap, setBrushSetting, brushRadius, tool, setTool, meshComponentMode, setMeshComponentMode, clearMeshComponentSelection, translateMeshComponents, deleteSelectedMeshComponents])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  if (!hydrated) return <div className="app-loading"><span className="brand-mark large"><span /></span><strong>Heating up the forge…</strong><div className="loading-line"><i /></div></div>

  const remix = (model: CommunityModel) => void safelyContinue(() => {
    if (!model.document) { starterGeneration.current++;setStartersOpen(true); return }
    const source = structuredClone(model.document)
    source.id = crypto.randomUUID()
    source.name = `${model.title} — Remix`
    source.revision = 0
    source.createdAt = new Date().toISOString()
    source.updatedAt = source.createdAt
    importDocument(source)
    setNotice(`Editable copy started from ${model.creator}'s model. Your changes save on this device.`)
    setArea('studio')
  })

  const shared = <Suspense fallback={<p role="status">Opening workspace tools…</p>}>
    <input ref={fileRef} hidden type="file" accept=".json,.forge.json,.3mf,.stl,.obj,.glb,.gltf" aria-label="Import a model or project" onChange={async (event) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      const asNew = importAsNew.current
      const targetDocument = useEditor.getState().document
      const generation = ++importGeneration.current
      const canApply = () => {
        if (generation !== importGeneration.current) return false
        if (useEditor.getState().document !== targetDocument) { setNotice('Your project changed while this file was opening. Import it again to use the current project.'); return false }
        return true
      }
      try {
        if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file smaller than 25 MB.')
        if (file.name.toLowerCase().endsWith('.json')) {
          const source = parseModelDocument(JSON.parse(await file.text()))
          if (!canApply()) return
          if (asNew) { source.id = crypto.randomUUID(); source.name = `${source.name || 'Untitled project'} — Imported`; source.createdAt = new Date().toISOString(); source.updatedAt = source.createdAt; source.revision = 0 }
          if (!await safelyContinue(() => { importDocument(source); setArea('studio') }, canApply)) return
        }
        else {
          const mesh = await importMeshFile(file)
          if (!canApply()) return
          setImportReview({name:file.name,mesh,confirm:async(reviewed)=>{
            if(!canApply())throw new Error('Project changed. Cancel and import again.')
            const apply=()=>{if(asNew){newDocument();useEditor.getState().dispatch({type:'rename-document',name:file.name.replace(/\.[^.]+$/, '')})}useEditor.getState().importMesh(file.name.replace(/\.[^.]+$/, ''),reviewed);setImportReview(null);setArea('studio')}
            if(asNew){await safelyContinue(apply,canApply)}else apply()
          }})
          return
        }
        setArea('studio')
      } catch (error) { setNotice(error instanceof Error ? error.message : 'That file could not be opened.') }
    }} />
    {startersOpen&&<StarterDialog key={starterId??"library"} initialId={starterId} onClose={()=>{starterGeneration.current++;setStartersOpen(false)}} onCreate={async doc=>{const generation=starterGeneration.current;await safelyContinue(()=>{importDocument(doc);setStartersOpen(false);setArea('studio')},()=>generation===starterGeneration.current)}}/>}
    {recoveryOpen&&<Suspense fallback={<p role="status">Opening recovery copies…</p>}><RecoveryDialog onClose={()=>{recoveryGeneration.current++;setRecoveryOpen(false)}} onOpen={async doc=>{const generation=recoveryGeneration.current;await safelyContinue(()=>{importDocument(doc);setRecoveryOpen(false);setArea('studio')},()=>generation===recoveryGeneration.current)}}/></Suspense>}
    {importReview && <ImportReview name={importReview.name} mesh={importReview.mesh} onClose={()=>{importGeneration.current++;setImportReview(null)}} onConfirm={importReview.confirm}/>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17} /></button></div>}
    {helpOpen && <WorkspaceHelp onClose={() => setHelpOpen(false)} onExample={startExample} onLaunch={(tab,toolkit)=>{setHelpOpen(false);if(tab==='cloud')setCloudOpen(true);else{setArea('studio');setTimeout(()=>window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab,toolkit}})),100)}}}/> }
    {cloudOpen&&<CloudWorkspace onClose={()=>setCloudOpen(false)} link={cloudLink} onLink={setCloudLink} onOpen={async(doc,project)=>{const now=new Date().toISOString(),copy={...doc,id:crypto.randomUUID(),createdAt:now,updatedAt:now};await safelyContinue(()=>{importDocument(copy);setCloudLink({projectId:project.id,localId:copy.id,revision:project.revision});setCloudOpen(false);setArea('studio');setNotice('Editable local copy opened. Cloud snapshots update only when you save them explicitly.');})}}/>}
    {saveBlocked && <WorkspaceDialog title="Your latest edits aren’t saved" description="Keep this project open while you retry. You can also download an editable backup of your current work." onClose={() => { setSaveBlocked(false); pendingNavigation.current = null }}>
      <p className="export-warning" role="alert">{useEditor.getState().saveError || 'This browser could not save your project.'}</p>
      <div className="save-recovery-actions"><button className="studio-secondary" onClick={() => { const current = useEditor.getState().document; downloadBlob(new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }), `${safeFilename(current.name)}.forge.json`); setNotice('Backup download requested. Check your browser’s downloads.') }}>Download editable backup</button>
      <button className="studio-primary" disabled={retryingSave} onClick={async () => { setRetryingSave(true); const pending = pendingNavigation.current; if (pending && await safelyContinue(pending.action, pending.isCurrent)) { setSaveBlocked(false); pendingNavigation.current = null }; setRetryingSave(false) }}>{retryingSave ? 'Saving…' : 'Retry save and continue'}</button></div>
    </WorkspaceDialog>}
  </Suspense>

  if (!active) return null

  if (area === 'community') return <>{shared}<Suspense fallback={<div className="route-loading"><span className="brand-mark large"><span /></span><strong>Opening the community…</strong></div>}>
    <Community theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} document={document} openPublishRequest={publishRequest} onPublishRequestHandled={() => setPublishRequest(0)} onOpenStudio={() => setArea('studio')} onOpenProjects={() => setArea('projects')} onRemix={remix} onPublished={(model) => void markProjectPublic(document.id, model.id)} />
  </Suspense></>

  if (area === 'projects') return <>{shared}<ProjectsHome
    theme={theme}
    onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
    currentDocument={document}
    onCreate={createProject}
    onOpen={(project) => { if (project.id === document.id) setArea('studio'); else void safelyContinue(() => { importDocument(project.document); setArea('studio') }) }}
    onPublish={(project) => void safelyContinue(() => { if (project.id !== document.id) importDocument(project.document); setPublishRequest((value) => value + 1); setArea('community') })}
    onOpenCommunity={() => setArea('community')}
    onImport={() => openImport(true)}
    onContinue={() => setArea('studio')}
    onOpenGuide={() => setHelpOpen(true)}
    onStartExample={startExample}
  /></>

  return (
    <div className={`app-shell mode-${document.workspaceMode} mobile-panel-${mobilePanel ?? 'none'}`}>
      <a className="skip-link" href="#studio" onClick={event=>{event.preventDefault();window.document.querySelector<HTMLElement>('.viewport-canvas')?.focus()}}>Skip to 3D canvas</a>
      <TopBar theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} onNewProject={createProject} onOpenProjects={() => void openProjects()} onOpenCommunity={() => setArea('community')} onOpenGenerate={() => setGenerateOpen(true)} onImport={() => openImport()} onCommands={() => setCommandsOpen(true)} onHelp={() => setHelpOpen(true)} exportOpen={exportOpen} onExportChange={setExportOpen} />
      <main className="workspace">
        {mobilePanel && <button className="mobile-panel-scrim" aria-label="Close side panel backdrop" onClick={() => setMobilePanel(null)} />}
        <Toolbox onClose={()=>setMobilePanel(null)} />
        <section className="viewport-wrap">
          <Suspense fallback={<p role="status">Opening 3D canvas…</p>}><Viewport theme={theme} /></Suspense>
          <ViewportTools />
          <div className="view-pills">
            <button aria-pressed={!showResult} className={!showResult ? 'active' : ''} onClick={() => setShowResult(false)}><BoxSelect size={15} /> Edit shapes</button>
            <button aria-pressed={showResult} className={showResult ? 'active' : ''} onClick={() => setShowResult(true)}>{showResult ? <Eye size={15} /> : <EyeOff size={15} />} Solid result</button>
          </div>
          {!document.nodes.length && tool !== 'place' && <div className="canvas-welcome"><span className="canvas-welcome-icon"><Box size={28} /></span><small>YOUR CANVAS, YOUR POSSIBILITIES</small><h2>What will you make?</h2><p>Start with a shape. Combine, carve, and make it your own.</p><button className="studio-primary" onClick={() => addPrimitive('box')}><Box size={16} /> Add your first shape</button><button className="canvas-help" onClick={() => setHelpOpen(true)}><CircleHelp size={15} /> A quick tour of the basics</button></div>}
          <div className="mobile-panel-controls"><button aria-pressed={mobilePanel === 'tools'} onClick={() => setMobilePanel(mobilePanel === 'tools' ? null : 'tools')}><PanelLeft size={17} /> Build tools</button><button aria-pressed={mobilePanel === 'inspector'} onClick={() => setMobilePanel(mobilePanel === 'inspector' ? null : 'inspector')}><PanelRight size={17} /> Inspector</button>{mobilePanel && <button aria-label="Close side panel" onClick={() => setMobilePanel(null)}><X size={17} /></button>}</div>
          <div className="interaction-hint"><MousePointerClick size={16} /><span>{tool === 'place' ? 'Click-drag on the plane to draw · Esc to cancel' : tool === 'draw-profile' ? 'Click polygon points · click the green start or press Enter to extrude' : tool === 'move' ? 'Drag the model to move it · use the axis handles for precision' : tool === 'sculpt-add' || tool === 'sculpt-carve' ? 'Paint volume · Shift inverts · [ and ] change radius' : tool.startsWith('sculpt') ? 'Drag directly on the mesh · Shift inverts · one Undo step per stroke' : 'Drag to orbit · wheel to zoom · right-drag to pan'}</span></div>
          {['pick-workplane','place-face','measure-angle'].includes(tool)&&<div className="canvas-task-prompt" role="status"><span>{tool==='pick-workplane'?'Pick a flat face for the workplane':tool==='place-face'?'Pick an outer face to put on the plate':'Pick three points: arm, vertex, arm'}</span><button className="workflow-text-action" onClick={()=>setTool('select')}>Cancel</button></div>}
          <SelectionDimensions />
          <div className="mobile-review-actions" role="group" aria-label="Phone review tools"><button onClick={()=>window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab:'print'}}))}>Print review</button><button aria-pressed={tool==='measure'} onClick={()=>{useEditor.getState().setMeasurement(null);setTool(tool==='measure'?'select':'measure')}}>Measure</button><button onClick={()=>setCloudOpen(true)}>Share / review</button></div>
          {geometryBusyVisible && <BuildProgress />}
          {(tool === 'place' || tool === 'draw-profile') && <div className="placement-actions">{tool === 'draw-profile' && <button className="studio-primary" onClick={() => window.dispatchEvent(new Event('formforge:finish-sketch'))}>Finish outline</button>}<button className="studio-secondary" onClick={() => { cancelPlacement(); if (tool === 'draw-profile') window.dispatchEvent(new Event('formforge:cancel-sketch')) }}>Cancel {tool === 'place' ? 'placement' : 'outline'}</button></div>}
          {geometryError && <div className="geometry-error" role="alert"><strong>That operation did not work</strong><span>{geometryError}</span><button onClick={() => void useEditor.getState().rebuild()}>Retry model</button></div>}
        </section>
        <Inspector onClose={()=>setMobilePanel(null)} />
      </main>
      <StatusBar />
      {shared}
      {commandsOpen && <CommandMenu onClose={() => setCommandsOpen(false)} onImport={() => openImport()} onExport={() => setExportOpen(true)} onProjects={() => void openProjects()} onHelp={() => setHelpOpen(true)} onGenerate={() => setGenerateOpen(true)} />}
      {generateOpen && <Suspense fallback={<div className="generate-backdrop"><div className="route-loading route-loading-card"><span className="brand-mark large"><span /></span><strong>Loading generation tools…</strong></div></div>}>
        <GenerateStudio onClose={() => setGenerateOpen(false)} />
      </Suspense>}
    </div>
  )
}
