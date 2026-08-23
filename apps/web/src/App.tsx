import { lazy, Suspense, useEffect, useState } from 'react'
import { BoxSelect, Eye, EyeOff, MousePointerClick, X } from 'lucide-react'
import { createDemoDocument } from '@formforge/model'
import { Viewport } from './components/Viewport'
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

const Community = lazy(() => import('./components/Community').then((module) => ({ default: module.Community })))
const GenerateStudio = lazy(() => import('./components/GenerateStudio').then((module) => ({ default: module.GenerateStudio })))

export function App() {
  const [theme, setTheme] = useState<AppearanceTheme>(() => localStorage.getItem('formforge-theme') === 'light' ? 'light' : 'dark')
  const [area, setArea] = useState<'projects' | 'studio' | 'community'>('community')
  const [publishRequest, setPublishRequest] = useState(0)
  const [generateOpen, setGenerateOpen] = useState(false)
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
  const updateNode = useEditor((state) => state.updateNode)
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

  useEffect(() => { void hydrate() }, [hydrate])

  useEffect(() => {
    window.document.documentElement.dataset.theme = theme
    window.document.documentElement.style.colorScheme = theme
    window.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f7f8fb' : '#12131a')
    localStorage.setItem('formforge-theme', theme)
  }, [theme])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected() }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (meshComponentMode === 'object') removeSelected()
        else deleteSelectedMeshComponents()
      }
      if (event.key === 'Escape') {
        cancelPlacement()
        if (meshComponentMode !== 'object') clearMeshComponentSelection()
        if (tool === 'draw-profile') window.dispatchEvent(new Event('formforge:cancel-sketch'))
      }
      if (!event.ctrlKey && !event.metaKey && selectedNodeId && ['1', '2', '3', '4'].includes(event.key)) {
        setMeshComponentMode(event.key === '1' ? 'vertex' : event.key === '2' ? 'edge' : event.key === '3' ? 'face' : 'object')
      }
      if (event.key === 'Enter' && tool === 'draw-profile') window.dispatchEvent(new Event('formforge:finish-sketch'))
      if (event.key === '[') setBrushSetting({ brushRadius: Math.max(0.5, brushRadius - 0.5) })
      if (event.key === ']') setBrushSetting({ brushRadius: Math.min(24, brushRadius + 0.5) })
      if (selectedNodeId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
        event.preventDefault()
        const node = document.nodes.find((item) => item.id === selectedNodeId)
        if (!node || node.locked) return
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
        const position = { ...node.transform.position }
        if (event.key === 'ArrowLeft') position.x -= step
        if (event.key === 'ArrowRight') position.x += step
        if (event.key === 'ArrowUp') position.y += step
        if (event.key === 'ArrowDown') position.y -= step
        if (event.key === 'PageUp') position.z += step
        if (event.key === 'PageDown') position.z -= step
        updateNode(node.id, { transform: { ...node.transform, position } })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, removeSelected, duplicateSelected, cancelPlacement, selectedNodeId, document, updateNode, translationSnap, setBrushSetting, brushRadius, tool, setTool, meshComponentMode, setMeshComponentMode, clearMeshComponentSelection, translateMeshComponents, deleteSelectedMeshComponents])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice, setNotice])

  if (!hydrated) return <div className="app-loading"><span className="brand-mark large"><span /></span><strong>Heating up the forge…</strong><div className="loading-line"><i /></div></div>

  const remix = (model: CommunityModel) => {
    const source = model.document ? structuredClone(model.document) : createDemoDocument()
    source.id = crypto.randomUUID()
    source.name = `${model.title} — Remix`
    source.revision = 0
    source.createdAt = new Date().toISOString()
    source.updatedAt = source.createdAt
    importDocument(source)
    setNotice(`Remix started from ${model.creator}'s model. Publish it when your changes are ready.`)
    setArea('studio')
  }

  if (area === 'community') return <Suspense fallback={<div className="route-loading"><span className="brand-mark large"><span /></span><strong>Opening the community…</strong></div>}>
    <Community theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} document={document} openPublishRequest={publishRequest} onOpenStudio={() => setArea('studio')} onOpenProjects={() => setArea('projects')} onRemix={remix} onPublished={(model) => void markProjectPublic(document.id, model.id)} />
  </Suspense>

  if (area === 'projects') return <ProjectsHome
    theme={theme}
    onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
    currentDocument={document}
    onCreate={() => { newDocument(); setArea('studio') }}
    onOpen={(project) => { importDocument(project.document); setArea('studio') }}
    onPublish={(project) => { importDocument(project.document); setPublishRequest((value) => value + 1); setArea('community') }}
    onOpenCommunity={() => setArea('community')}
  />

  return (
    <div className={`app-shell mode-${document.workspaceMode}`}>
      <TopBar theme={theme} onToggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} onOpenProjects={() => setArea('projects')} onOpenCommunity={() => setArea('community')} onOpenGenerate={() => setGenerateOpen(true)} />
      <main className="workspace">
        <Toolbox />
        <section className="viewport-wrap">
          <Viewport theme={theme} />
          <ViewportTools />
          <div className="view-pills">
            <button className={!showResult ? 'active' : ''} onClick={() => setShowResult(false)}><BoxSelect size={15} /> Edit shapes</button>
            <button className={showResult ? 'active' : ''} onClick={() => setShowResult(true)}>{showResult ? <Eye size={15} /> : <EyeOff size={15} />} Solid result</button>
          </div>
          <div className="view-cube" aria-hidden="true"><span className="cube-top">TOP</span><span className="cube-front">FRONT</span><span className="cube-side">R</span></div>
          <div className="interaction-hint"><MousePointerClick size={16} /><span>{tool === 'place' ? 'Click-drag on the plane to draw · Esc to cancel' : tool === 'draw-profile' ? 'Click polygon points · click the green start or press Enter to extrude' : tool === 'move' ? 'Drag the model to move it · use the axis handles for precision' : tool === 'sculpt-add' || tool === 'sculpt-carve' ? 'Paint volume · Shift inverts · [ and ] change radius' : tool.startsWith('sculpt') ? 'Drag directly on the mesh · Shift inverts · one Undo step per stroke' : 'Drag to orbit · wheel to zoom · right-drag to pan'}</span></div>
          {geometryBusyVisible && <div className="rebuild-chip"><span /> Refining solid in background</div>}
          {geometryError && <div className="geometry-error"><strong>That operation did not work</strong><span>{geometryError}</span></div>}
        </section>
        <Inspector />
      </main>
      <StatusBar />
      {notice && <div className="toast"><span>{notice}</span><button onClick={() => setNotice(null)}><X size={15} /></button></div>}
      {generateOpen && <Suspense fallback={<div className="generate-backdrop"><div className="route-loading route-loading-card"><span className="brand-mark large"><span /></span><strong>Loading generation tools…</strong></div></div>}>
        <GenerateStudio onClose={() => setGenerateOpen(false)} />
      </Suspense>}
    </div>
  )
}
