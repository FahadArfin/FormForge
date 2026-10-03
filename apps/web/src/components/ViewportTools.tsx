import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Focus, Grid3X3, Magnet, Maximize2, Box, Grid2X2, MoreHorizontal, Ruler, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useEditor } from '@/store/editor'
import './ViewportTools.css'

const snapOptions = [null, 0.1, 0.5, 1, 5, 10] as const

export function ViewportTools() {
  const [displayOpen, setDisplayOpen] = useState(false)
  const displayRef = useRef<HTMLDivElement>(null)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const showGrid = useEditor((state) => state.showGrid)
  const showReferencePlanes = useEditor((state) => state.showReferencePlanes)
  const xrayEnabled = useEditor((state) => state.xrayEnabled)
  const translationSnap = useEditor((state) => state.translationSnap)
  const displayMode = useEditor((state) => state.displayMode)
  const tool = useEditor((state) => state.tool)
  const measurement = useEditor((state) => state.measurement)
  const setShowGrid = useEditor((state) => state.setShowGrid)
  const setShowReferencePlanes = useEditor((state) => state.setShowReferencePlanes)
  const setXrayEnabled = useEditor((state) => state.setXrayEnabled)
  const setTranslationSnap = useEditor((state) => state.setTranslationSnap)
  const setDisplayMode = useEditor((state) => state.setDisplayMode)
  const setTool = useEditor((state) => state.setTool)
  const setMeasurement = useEditor((state) => state.setMeasurement)

  const frame = (selectedOnly: boolean) => window.dispatchEvent(new CustomEvent('formforge:frame', { detail: { selectedOnly } }))
  const setView = (view: string) => window.dispatchEvent(new CustomEvent('formforge:view', { detail: { view } }))
  const distance = measurement ? Math.hypot(measurement.end.x - measurement.start.x, measurement.end.y - measurement.start.y, measurement.end.z - measurement.start.z) : null

  useEffect(() => {
    if (!displayOpen) return
    const dismiss = (event: PointerEvent) => { if (!displayRef.current?.contains(event.target as Node)) setDisplayOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDisplayOpen(false); displayRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [displayOpen])

  return (
    <div className="viewport-tools viewport-controls" role="group" aria-label="Viewport controls">
      <label className="view-control" title="Standard camera view">
        <Box size={15} />
        <select aria-label="Camera view" defaultValue="iso" onChange={(event) => setView(event.target.value)}><option value="iso">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="right">Right</option><option value="back">Back</option><option value="left">Left</option><option value="bottom">Bottom</option></select>
      </label>
      <button onClick={() => frame(false)} title="Frame the complete model (F)"><Maximize2 size={15} /><span>Fit all</span></button>
      <label className="snap-control" title="Movement granularity">
        <Magnet size={15} />
        <span>Snap</span>
        <select aria-label="Movement snap" value={translationSnap ?? 'free'} onChange={(event) => setTranslationSnap(event.target.value === 'free' ? null : Number(event.target.value))}>
          {snapOptions.map((value) => <option key={value ?? 'free'} value={value ?? 'free'}>{value === null ? 'Free' : `${value} mm`}</option>)}
        </select>
      </label>
      <button aria-pressed={tool === 'measure'} className={tool === 'measure' ? 'active' : ''} onClick={() => { const nextTool = useEditor.getState().tool === 'measure' ? 'select' : 'measure'; setMeasurement(null); setTool(nextTool) }} title="Measure between two surface points"><Ruler size={15} /><span>{distance === null ? 'Measure' : `${distance.toFixed(2)} mm`}</span></button>
      <div className="viewport-display" ref={displayRef}>
        <button className={`viewport-display-trigger ${displayOpen ? 'active' : ''}`} aria-label="Display options" aria-expanded={displayOpen} aria-controls="viewport-display-panel" onClick={() => setDisplayOpen((current) => !current)} title="Display options"><SlidersHorizontal size={16} /><ChevronDown size={12} /></button>
        {displayOpen && <div id="viewport-display-panel" className="viewport-display-panel" role="group" aria-label="Display options">
          <span className="viewport-menu-label">Canvas display</span>
          <button aria-pressed={showGrid} className={showGrid ? 'active' : ''} onClick={() => setShowGrid(!showGrid)}><Grid3X3 size={16} /><span>Build plane</span><em>{showGrid ? 'On' : 'Off'}</em></button>
          <button aria-pressed={showReferencePlanes} className={showReferencePlanes ? 'active' : ''} onClick={() => setShowReferencePlanes(!showReferencePlanes)} title="XY, XZ, and YZ reference planes"><Grid3X3 size={16} /><span>Reference planes</span><em>{showReferencePlanes ? 'On' : 'Off'}</em></button>
          <button aria-pressed={xrayEnabled} className={xrayEnabled ? 'active' : ''} onClick={() => setXrayEnabled(!xrayEnabled)} title="Show source outlines through the solid">{xrayEnabled ? <Eye size={16} /> : <EyeOff size={16} />}<span>X-ray</span><em>{xrayEnabled ? 'On' : 'Off'}</em></button>
          <span className="viewport-menu-label">Mesh display</span>
          <div className="mesh-view-switch" role="group" aria-label="Mesh display">
            <button aria-pressed={displayMode === 'solid'} className={displayMode === 'solid' ? 'active' : ''} onClick={() => setDisplayMode('solid')} title="Solid shading"><Box size={16} /><span>Solid</span></button>
            <button aria-pressed={displayMode === 'wireframe'} className={displayMode === 'wireframe' ? 'active' : ''} onClick={() => setDisplayMode('wireframe')} title="Polygon wireframe"><Grid2X2 size={16} /><span>Wire</span></button>
            <button aria-pressed={displayMode === 'vertices'} className={displayMode === 'vertices' ? 'active' : ''} onClick={() => setDisplayMode('vertices')} title="Polygon vertices"><MoreHorizontal size={16} /><span>Points</span></button>
          </div>
          <button className="frame-selection-control" disabled={!selectedNodeId} onClick={() => { frame(true); setDisplayOpen(false) }} title="Frame the selected shape (Shift F)"><Focus size={16} /><span>Fit selection</span><kbd>⇧ F</kbd></button>
          <p>Arrow keys nudge your selection.<br />Shift ×10 · Alt ×0.1</p>
        </div>}
      </div>
    </div>
  )
}
