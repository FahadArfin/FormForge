import { BoxSelect, Eye, EyeOff, Focus, Grid3X3, Magnet, Maximize2, Orbit, Box, Grid2X2, MoreHorizontal, Ruler } from 'lucide-react'
import { useEditor } from '@/store/editor'

const snapOptions = [null, 0.1, 0.5, 1, 5, 10] as const

export function ViewportTools() {
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

  return (
    <div className="viewport-tools" aria-label="Viewport controls">
      <button className={showGrid ? 'active' : ''} onClick={() => setShowGrid(!showGrid)} title={showGrid ? 'Hide build plane' : 'Show build plane'}>
        {showGrid ? <Grid3X3 size={15} /> : <Orbit size={15} />}<span>{showGrid ? 'Build plane' : 'Free space'}</span>
      </button>
      <button className={showReferencePlanes ? 'active' : ''} onClick={() => setShowReferencePlanes(!showReferencePlanes)} title="Toggle XY, XZ, and YZ reference planes"><Grid3X3 size={15} /><span>Planes</span></button>
      <button className={xrayEnabled ? 'active' : ''} onClick={() => setXrayEnabled(!xrayEnabled)} title="Show source outlines through the solid">
        {xrayEnabled ? <Eye size={15} /> : <EyeOff size={15} />}<span>X-ray</span>
      </button>
      <button onClick={() => frame(false)} title="Frame the complete model"><Maximize2 size={15} /><span>Frame all</span></button>
      <button disabled={!selectedNodeId} onClick={() => frame(true)} title="Frame the selected shape"><Focus size={15} /><span>Selection</span></button>
      <label className="view-control" title="Standard camera view">
        <span>View</span>
        <select defaultValue="iso" onChange={(event) => setView(event.target.value)}><option value="iso">Isometric</option><option value="top">Top</option><option value="front">Front</option><option value="right">Right</option><option value="back">Back</option><option value="left">Left</option><option value="bottom">Bottom</option></select>
      </label>
      <span className="viewport-tools-separator" />
      <button className={tool === 'measure' ? 'active' : ''} onClick={() => { const nextTool = useEditor.getState().tool === 'measure' ? 'select' : 'measure'; setMeasurement(null); setTool(nextTool) }} title="Measure between any two surface points"><Ruler size={15} /><span>{distance === null ? 'Measure' : `${distance.toFixed(2)} mm`}</span></button>
      <span className="viewport-tools-separator" />
      <div className="mesh-view-switch" role="group" aria-label="Mesh display">
        <button className={displayMode === 'solid' ? 'active' : ''} onClick={() => setDisplayMode('solid')} title="Solid shading"><Box size={14} /></button>
        <button className={displayMode === 'wireframe' ? 'active' : ''} onClick={() => setDisplayMode('wireframe')} title="Polygon wireframe"><Grid2X2 size={14} /></button>
        <button className={displayMode === 'vertices' ? 'active' : ''} onClick={() => setDisplayMode('vertices')} title="Polygon vertices"><MoreHorizontal size={14} /></button>
      </div>
      <label className="snap-control" title="Movement granularity">
        <Magnet size={15} />
        <span>Snap</span>
        <select value={translationSnap ?? 'free'} onChange={(event) => setTranslationSnap(event.target.value === 'free' ? null : Number(event.target.value))}>
          {snapOptions.map((value) => <option key={value ?? 'free'} value={value ?? 'free'}>{value === null ? 'Free' : `${value} mm`}</option>)}
        </select>
      </label>
      <span className="viewport-tools-separator" />
      <span className="precision-tip"><BoxSelect size={14} /> Arrow keys nudge · Shift ×10 · Alt ×0.1</span>
    </div>
  )
}
