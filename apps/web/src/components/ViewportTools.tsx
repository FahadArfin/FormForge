import { SavedViewsDialog } from './SavedViewsDialog'
import { WorkspaceDialog } from './WorkspaceDialog'
import { focusSelection } from '@/lib/selectionFocus'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Focus, Grid3X3, Magnet, Maximize2, Box, Grid2X2, MoreHorizontal, Ruler, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import './ViewportTools.css'

const snapOptions = [null, 0.1, 0.5, 1, 5, 10] as const
const SelectionSetsDialog=lazy(()=>import('./SelectionSetsDialog').then(m=>({default:m.SelectionSetsDialog})))
const VariantManagerDialog=lazy(()=>import('./VariantManagerDialog').then(m=>({default:m.VariantManagerDialog})))
const PartsPackageDialog=lazy(()=>import('./PartsPackageDialog').then(m=>({default:m.PartsPackageDialog})))

export function ViewportTools() {
  const projection=useInspection(s=>s.projection)
  const [selectionSetsOpen,setSelectionSetsOpen]=useState(false),[variantsOpen,setVariantsOpen]=useState(false)
  const [partsOpen,setPartsOpen]=useState(false)
  useEffect(()=>{const open=()=>setPartsOpen(true);window.addEventListener('formforge:parts-package',open);return()=>window.removeEventListener('formforge:parts-package',open)},[])
  useEffect(()=>{const sets=()=>setSelectionSetsOpen(true),variants=()=>setVariantsOpen(true);window.addEventListener('formforge:selection-sets',sets);window.addEventListener('formforge:variants',variants);return()=>{window.removeEventListener('formforge:selection-sets',sets);window.removeEventListener('formforge:variants',variants)}},[])
  const focus=useInspection(s=>s.focus),setFocus=useInspection(s=>s.setFocus),pickOverlaps=useInspection(s=>s.pickOverlaps),setPickOverlaps=useInspection(s=>s.setPickOverlaps)
  const documentId=useEditor(s=>s.document.id),showResult=useEditor(s=>s.showResult)
  const [overlaps,setOverlaps]=useState<string[]|null>(null)
  useEffect(()=>{setFocus(null);setPickOverlaps(false);setOverlaps(null)},[documentId,setFocus,setPickOverlaps])
  useEffect(()=>{if(showResult){setFocus(null);setPickOverlaps(false)}},[showResult,setFocus,setPickOverlaps])
  useEffect(()=>{const listener=(event:Event)=>{const detail=(event as CustomEvent<{documentId:string;ids:string[]}>).detail;if(detail.documentId===useEditor.getState().document.id)setOverlaps(detail.ids)};window.addEventListener('formforge:overlaps',listener);return()=>window.removeEventListener('formforge:overlaps',listener)},[])
  const endFocus=()=>{const previous=useInspection.getState().focus;setFocus(null);if(previous?.documentId===documentId)useEditor.getState().setShowResult(previous.wasResult)}
  const [savedViewsOpen,setSavedViewsOpen]=useState(false)
  useEffect(()=>{const open=()=>setSavedViewsOpen(true);window.addEventListener('formforge:saved-views',open);return()=>window.removeEventListener('formforge:saved-views',open)},[])
  const [displayOpen, setDisplayOpen] = useState(false)
  const displayRef = useRef<HTMLDivElement>(null)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const showGrid = useEditor((state) => state.showGrid)
  const showReferencePlanes = useEditor((state) => state.showReferencePlanes)
  const xrayEnabled = useEditor((state) => state.xrayEnabled)
  const translationSnap = useEditor((state) => state.translationSnap)
  const rotationSnap = useEditor((state) => state.rotationSnap)
  const scaleSnap = useEditor((state) => state.scaleSnap)
  const setRotationSnap = useEditor((state) => state.setRotationSnap)
  const setScaleSnap = useEditor((state) => state.setScaleSnap)
  const displayMode = useEditor((state) => state.displayMode)
  const tool = useEditor((state) => state.tool)
  const measurement = useEditor((state) => state.measurement)
  const measurementMode = useInspection(state => state.measurementMode)
  const setMeasurementMode = useInspection(state => state.setMeasurementMode)
  const sectionEnabled = useInspection(state => state.section.enabled)
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
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDisplayOpen(false); displayRef.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape, true) }
  }, [displayOpen])

  return (
    <div className="viewport-tools viewport-controls" role="group" aria-label="Viewport controls">
      {savedViewsOpen&&<SavedViewsDialog onClose={()=>setSavedViewsOpen(false)}/>}
      <Suspense fallback={null}>{selectionSetsOpen&&<SelectionSetsDialog onClose={()=>setSelectionSetsOpen(false)}/>} {variantsOpen&&<VariantManagerDialog onClose={()=>setVariantsOpen(false)}/>}</Suspense>
      <Suspense fallback={null}>{partsOpen&&<PartsPackageDialog onClose={()=>setPartsOpen(false)}/>}</Suspense>
      {overlaps&&<WorkspaceDialog title="Choose a part under the pointer" onClose={()=>setOverlaps(null)}><div className="project-action-list">{overlaps.map(id=>{const node=useEditor.getState().document.nodes.find(n=>n.id===id);return node&&<button key={id} onClick={()=>{useEditor.getState().selectNode(id);setOverlaps(null);window.dispatchEvent(new CustomEvent('formforge:open-inspector',{detail:{tab:'model',nodeId:id}}))}}>{node.name} · {node.kind}</button>})}</div>{!overlaps.length&&<p>No editable visible parts here. Try another point.</p>}</WorkspaceDialog>}
      {focus&&<button className="active" onClick={endFocus}>Exit isolation ({focus.ids.length})</button>}
      {pickOverlaps&&<button className="active" onClick={()=>setPickOverlaps(false)}>Finish overlap picking</button>}
      <label className="view-control" title="Standard camera view">
        <Box size={15} />
        <select aria-label="Camera view" value="" onChange={(event) => setView(event.target.value)}><option value="" disabled>View</option><option value="iso">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="right">Right</option><option value="back">Back</option><option value="left">Left</option><option value="bottom">Bottom</option></select>
      </label>
      <button onClick={() => frame(false)} title="Frame the complete model (F)"><Maximize2 size={15} /><span>Fit all</span></button>
      <button aria-label="Zoom in" onClick={()=>window.dispatchEvent(new CustomEvent('formforge:zoom',{detail:{direction:'in'}}))}>+</button>
      <button aria-label="Zoom out" onClick={()=>window.dispatchEvent(new CustomEvent('formforge:zoom',{detail:{direction:'out'}}))}>−</button>
      <label className="snap-control" title={`${tool === 'rotate' ? 'Rotation' : tool === 'scale' ? 'Scale' : 'Movement'} snap increment`}>
        <Magnet size={15} />
        <span>Snap</span>
        {tool === 'rotate' ? <select aria-label="Rotation snap" value={rotationSnap} onChange={(event) => setRotationSnap(Number(event.target.value))}>{[0, 5, 15, 45, 90].map(value => <option key={value} value={value}>{value ? `${value}°` : 'Free'}</option>)}</select> : tool === 'scale' ? <select aria-label="Scale snap" value={scaleSnap} onChange={(event) => setScaleSnap(Number(event.target.value))}>{[0, 0.01, 0.05, 0.1, 0.25].map(value => <option key={value} value={value}>{value ? `${value * 100}%` : 'Free'}</option>)}</select> : <select aria-label="Movement snap" value={translationSnap ?? 'free'} onChange={(event) => setTranslationSnap(event.target.value === 'free' ? null : Number(event.target.value))}>
          {snapOptions.map((value) => <option key={value ?? 'free'} value={value ?? 'free'}>{value === null ? 'Free' : `${value} mm`}</option>)}
        </select>}
      </label>
      <button aria-label={distance === null ? 'Measure' : `Measured distance ${distance.toFixed(2)} mm`} aria-pressed={tool === 'measure'} className={`measure-control ${tool === 'measure' ? 'active' : ''}`} onClick={() => { const nextTool = useEditor.getState().tool === 'measure' ? 'select' : 'measure'; setMeasurement(null); setTool(nextTool) }} title="Measure between two surface points"><Ruler size={15} /><span>{distance === null ? 'Measure' : `${distance.toFixed(2)} mm`}</span></button>
      {tool === 'measure' && <div className="measurement-details" role="group" aria-label="Measurement settings and results">
        <div><label>Pick <select aria-label="Measurement picking" value={measurementMode} onChange={event => { setMeasurementMode(event.target.value as 'surface' | 'vertex'); setMeasurement(null) }}><option value="vertex">Mesh vertex</option><option value="surface">Surface point</option></select></label><button onClick={() => setMeasurement(null)}>Clear</button></div>
        <p>{measurementMode === 'vertex' ? 'Click near a corner to snap to a vertex of the hit triangle.' : 'Click two points on the visible surface.'} Click again to finish.</p>
        {measurement && <><strong>{distance?.toFixed(3)} mm <small>{measurement.complete ? 'distance' : 'preview'}</small></strong><dl>{(['x', 'y', 'z'] as const).map(axis => <div key={axis}><dt>Δ{axis.toUpperCase()}</dt><dd>{Math.abs(measurement.end[axis] - measurement.start[axis]).toFixed(3)} mm</dd></div>)}</dl></>}
        <small>Readings clear when geometry changes. Vertices follow the mesh tessellation.</small>
      </div>}
      <div className="viewport-display" ref={displayRef}>
        <button className={`viewport-display-trigger ${displayOpen ? 'active' : ''}`} aria-label="Display options" aria-expanded={displayOpen} aria-controls="viewport-display-panel" onClick={() => setDisplayOpen((current) => !current)} title="Display options"><SlidersHorizontal size={16} /><ChevronDown size={12} /></button>
        {displayOpen && <div id="viewport-display-panel" className="viewport-display-panel" role="group" aria-label="Display options">
          <span className="viewport-menu-label">Canvas display</span><button onClick={()=>{setSavedViewsOpen(true);setDisplayOpen(false)}}><Eye size={16}/><span>Saved camera views</span></button>
          <button aria-pressed={projection==='orthographic'} onClick={()=>useInspection.setState({projection:projection==='perspective'?'orthographic':'perspective'})}><Box size={16}/><span>Orthographic projection</span><em>{projection==='orthographic'?'On':'Off'}</em></button>
          <button onClick={()=>{setSelectionSetsOpen(true);setDisplayOpen(false)}}><Focus size={16}/><span>Named selection sets</span></button>
          <button disabled={!selectedNodeId&&!focus} onClick={()=>{if(focus)endFocus();else{const s=useEditor.getState();setFocus({documentId:s.document.id,ids:focusSelection(s.document.nodes,s.selectedNodeIds),wasResult:s.showResult});s.setShowResult(false)}setDisplayOpen(false)}}><Focus size={16}/><span>{focus?'Exit isolation':'Isolate selected assembly'}</span></button>
          <button aria-pressed={pickOverlaps} onClick={()=>{setPickOverlaps(!pickOverlaps);useEditor.getState().setShowResult(false);useEditor.getState().setTool('select');setDisplayOpen(false)}}><Focus size={16}/><span>Pick overlapping parts</span></button>
          <button aria-pressed={sectionEnabled} onClick={() => { window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'tools', toolkit: 'inspect' } })); setDisplayOpen(false) }}><Box size={16} /><span>Section inspection</span><em>{sectionEnabled ? 'On' : 'Open'}</em></button>
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
      {sectionEnabled && <button className="active" title="Disable section inspection and show the full model" onClick={() => useInspection.getState().setSection({ enabled: false })}>Section on · ×</button>}
    </div>
  )
}
