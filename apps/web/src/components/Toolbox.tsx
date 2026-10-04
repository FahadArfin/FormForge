import { useEffect, useState } from 'react'
import { Box, CircleDot, Cone, Cylinder, Hand, MousePointer2, RotateCw, Scaling, Sparkles, Waves, WandSparkles, Radius, Gauge, Blend, FlipHorizontal2, PenTool, CircleDashed, Pill, Triangle, Star, CirclePlus, Minimize2, PanelTopClose, Search, ChevronDown, X } from 'lucide-react'
import type { ModelNode, PrimitiveKind, ToolMode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { IconButton } from './IconButton'
import { ProfileRecipeCreator } from './ProfileRecipeCreator'
import './Toolbox.css'
import { NumberInput } from './NumberInput'

type ShapeChoice = Exclude<PrimitiveKind, 'extrude' | 'revolve' | 'mesh'>

const shapes: { kind: ShapeChoice; label: string; icon: typeof Box }[] = [
  { kind: 'box', label: 'Box', icon: Box },
  { kind: 'roundedBox', label: 'Soft box', icon: Box },
  { kind: 'cylinder', label: 'Cylinder', icon: Cylinder },
  { kind: 'sphere', label: 'Sphere', icon: CircleDot },
  { kind: 'cone', label: 'Cone', icon: Cone },
  { kind: 'torus', label: 'Torus', icon: CircleDashed },
  { kind: 'capsule', label: 'Capsule', icon: Pill },
  { kind: 'tube', label: 'Tube', icon: CircleDashed },
  { kind: 'wedge', label: 'Wedge', icon: Triangle },
  { kind: 'star', label: 'Star', icon: Star },
  { kind: 'gear', label: 'Gear', icon: Gauge },
  { kind: 'loft', label: 'Loft', icon: Blend },
  { kind: 'spring', label: 'Spring', icon: Waves },
]

const tools: { value: ToolMode; label: string; shortcut: string; icon: typeof Hand }[] = [
  { value: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { value: 'move', label: 'Move', shortcut: 'G', icon: Hand },
  { value: 'rotate', label: 'Rotate', shortcut: 'R', icon: RotateCw },
  { value: 'scale', label: 'Scale', shortcut: 'S', icon: Scaling },
]

const defaultParameters: ModelNode['parameters'] = { width: 20, depth: 20, height: 20, radius: 10, radiusTop: 4, segments: 48, fillet: 2, count: 12, twist: 0, topWidth: 12, topDepth: 12, wall: 0 }

export function Toolbox({ onClose }: { onClose?: () => void }) {
  const [task, setTask] = useState<'build' | 'sculpt'>('build')
  const [search, setSearch] = useState('')
  const [moreShapes, setMoreShapes] = useState(false)
  const [shape, setShape] = useState<ShapeChoice | null>(null)
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [boolean, setBoolean] = useState<'add' | 'cut'>('add')
  const [parameters, setParameters] = useState(defaultParameters)
  const addPrimitive = useEditor((state) => state.addPrimitive)
  const addProfileRecipe = useEditor((state) => state.addProfileRecipe)
  const tool = useEditor((state) => state.tool)
  const profileOperation = useEditor((state) => state.profileOperation)
  const setTool = useEditor((state) => state.setTool)
  const workspaceMode = useEditor((state) => state.document.workspaceMode)
  const units = useEditor((state) => state.document.units)
  const brushRadius = useEditor((state) => state.brushRadius)
  const brushStrength = useEditor((state) => state.brushStrength)
  const brushSpacing = useEditor((state) => state.brushSpacing)
  const brushFalloff = useEditor((state) => state.brushFalloff)
  const brushSymmetryX = useEditor((state) => state.brushSymmetryX)
  const brushSymmetryY = useEditor((state) => state.brushSymmetryY)
  const brushSymmetryZ = useEditor((state) => state.brushSymmetryZ)
  const brushFrontFacesOnly = useEditor((state) => state.brushFrontFacesOnly)
  const dynamicTopology = useEditor((state) => state.dynamicTopology)
  const sculptDetail = useEditor((state) => state.sculptDetail)
  const setBrushSetting = useEditor((state) => state.setBrushSetting)
  const beginProfileDrawing = useEditor((state) => state.beginProfileDrawing)
  const selectedNode = useEditor((state) => state.document.nodes.find((node) => node.id === state.selectedNodeId))
  const makeSculptable = useEditor((state) => state.makeSculptable)
  const subdivideSelectedMesh = useEditor((state) => state.subdivideSelectedMesh)
  const clearSculptMask = useEditor((state) => state.clearSculptMask)
  const invertSculptMask = useEditor((state) => state.invertSculptMask)
  const volumeLocked = useEditor(state => state.document.nodes.some(node => node.locked && !node.suppressed))
  const isVolumeBrush = tool === 'sculpt-add' || tool === 'sculpt-carve'
  const isSculptMesh = selectedNode?.kind === 'mesh' && Boolean(selectedNode.mesh)
  const visibleShapes = shapes.filter((item, index) => (!search && !moreShapes ? index < 6 : true) && item.label.toLowerCase().includes(search.trim().toLowerCase()))

  useEffect(() => {
    if (tool.startsWith('sculpt-')) setTask('sculpt')
    else if (tool === 'draw-profile' || tool === 'place') setTask('build')
  }, [tool])

  const setParameter = (key: keyof ModelNode['parameters'], value: number) => {
    if (!Number.isFinite(value)) return
    setParameters((current) => ({ ...current, [key]: key === 'twist' ? value : Math.max(key === 'radiusTop' ? 0 : 0.1, value) }))
  }
  const field = (label: string, key: keyof ModelNode['parameters'], suffix = 'mm') => <NumberInput label={label} accessibleLabel={`${label} dimension`} value={parameters[key]} suffix={suffix} onChange={value => setParameter(key, value)} />

  return (
    <aside className="toolbox panel-surface modeling-toolbox" aria-label="Modeling tools">
      <button className="drawer-close" onClick={onClose}>Close build tools <X size={18}/></button>
      <div className="toolbox-section transform-section">
        <span className="section-kicker">Tools</span>
        <div className="transform-tools" role="group" aria-label="Transform tools">
          {tools.map(({ value, label, shortcut, icon: Icon }) => (
            <button key={value} type="button" className={tool === value ? 'active' : ''} aria-pressed={tool === value} title={`${label} (${shortcut})`} onClick={() => setTool(value)}><Icon size={17} /><span>{label}</span><kbd>{shortcut}</kbd></button>
          ))}
        </div>
      </div>
      <div className="modeling-task-tabs" role="tablist" aria-label="Modeling task" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const next = event.key === 'Home' ? 'build' : event.key === 'End' ? 'sculpt' : task === 'build' ? 'sculpt' : 'build'
        setTask(next)
        if (next === 'build' && tool.startsWith('sculpt-')) setTool('select')
        document.getElementById(`${next}-tools-tab`)?.focus()
      }}>
        <button id="build-tools-tab" role="tab" tabIndex={task === 'build' ? 0 : -1} aria-selected={task === 'build'} aria-controls="build-tools-panel" onClick={() => { setTask('build'); if (tool.startsWith('sculpt-')) setTool('select') }}><Box size={17} />Build</button>
        <button id="sculpt-tools-tab" role="tab" tabIndex={task === 'sculpt' ? 0 : -1} aria-selected={task === 'sculpt'} aria-controls="sculpt-tools-panel" onClick={() => setTask('sculpt')}><Waves size={17} />Sculpt</button>
      </div>
      {task === 'build' && <div id="build-tools-panel" role="tabpanel" aria-labelledby="build-tools-tab" className="toolbox-section build-section">
        <div className="section-title"><span className="section-kicker">Add a shape</span></div>
        <p className="toolbox-intro">Choose a shape, then set its size.</p>
        <label className="shape-search"><Search size={16} /><input type="search" aria-label="Search shapes" placeholder="Search shapes…" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear shape search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
        <div className="shape-library">
          {visibleShapes.map(({ kind, label, icon: Icon }) => (
            <button key={kind} className={shape === kind ? 'active' : ''} aria-pressed={shape === kind} onClick={() => { setShape(kind); setRecipeOpen(false) }} title={`Add ${label.toLowerCase()}`}><Icon size={24} strokeWidth={1.6} /><span>{label}</span></button>
          ))}
        </div>
        {visibleShapes.length === 0 && <p className="shape-search-empty">No shapes found. Try “box” or “tube”.</p>}
        {!search && <button className="more-shapes-button" aria-expanded={moreShapes} onClick={() => setMoreShapes((current) => !current)}>{moreShapes ? 'Show basic shapes' : 'More shapes'}<ChevronDown size={15} className={moreShapes ? 'expanded' : ''} /></button>}
        {shape && <div className="shape-setup">
          <div className="shape-setup-head"><strong>{shapes.find((item) => item.kind === shape)?.label} dimensions</strong><button aria-label="Close shape dimensions" onClick={() => setShape(null)}><X size={16} /></button></div>
          <div className="solid-kind-switch" role="group" aria-label="Shape operation"><button aria-pressed={boolean === 'add'} className={boolean === 'add' ? 'active' : ''} onClick={() => setBoolean('add')}>Solid</button><button aria-pressed={boolean === 'cut'} className={boolean === 'cut' ? 'active carve' : ''} onClick={() => setBoolean('cut')}>Cutout</button></div>
          <div className="shape-dimensions">
            {(shape === 'box' || shape === 'roundedBox' || shape === 'wedge') && <>{field('Width', 'width')}{field('Depth', 'depth')}{field('Height', 'height')}{shape === 'roundedBox' && field('Corner', 'fillet')}</>}
            {(shape === 'cylinder' || shape === 'cone' || shape === 'capsule') && <>{field('Radius', 'radius')}{field('Height', 'height')}{shape === 'cone' && field('Top', 'radiusTop')}</>}
            {shape === 'sphere' && field('Radius', 'radius')}
            {shape === 'torus' && <>{field('Ring', 'radius')}{field('Tube', 'radiusTop')}</>}
            {shape === 'tube' && <>{field('Outer', 'radius')}{field('Inner', 'radiusTop')}{field('Height', 'height')}</>}
            {shape === 'star' && <>{field('Outer', 'radius')}{field('Inner', 'radiusTop')}{field('Height', 'height')}</>}
            {shape === 'gear' && <>{field('Outer', 'radius')}{field('Root', 'radiusTop')}{field('Height', 'height')}{field('Teeth', 'count', '')}</>}
            {shape === 'loft' && <>{field('Base W', 'width')}{field('Base D', 'depth')}{field('Top W', 'topWidth')}{field('Top D', 'topDepth')}{field('Height', 'height')}{field('Twist', 'twist', '°')}</>}
            {shape === 'spring' && <>{field('Coil R', 'radius')}{field('Wire R', 'radiusTop')}{field('Height', 'height')}{field('Turns', 'count', '')}</>}
          </div>
          <button className={`place-shape ${boolean}`} onClick={() => { addPrimitive(shape, boolean, parameters); setShape(null) }}><MousePointer2 size={15} /> Place in workspace</button>
          <small className="shape-setup-tip">Next, click the canvas to place. Drag to resize the footprint.</small>
        </div>}
        <button
          className={`profile-recipe-launch ${recipeOpen ? 'active' : ''}`}
          type="button"
          aria-expanded={recipeOpen}
          onClick={() => { setRecipeOpen((current) => !current); setShape(null) }}
        >
          <WandSparkles size={17} />
          <span><strong>Outline recipes</strong><small>Make a custom profile</small></span>
          <ChevronDown size={15} />
        </button>
        {recipeOpen && <ProfileRecipeCreator
          unit={units}
          onCreate={(recipe, operation) => {
            addProfileRecipe(recipe, operation)
            setRecipeOpen(false)
          }}
        />}
        {workspaceMode === 'pro' && <div className="profile-tools">
          <button className={`profile-tool ${tool === 'draw-profile' && profileOperation === 'extrude' ? 'active' : ''}`} onClick={() => { setRecipeOpen(false); beginProfileDrawing('extrude') }}><PenTool size={17} /><span><strong>Draw & extrude</strong><small>Constrained 2D profile to solid</small></span></button>
          <button className={`profile-tool ${tool === 'draw-profile' && profileOperation === 'revolve' ? 'active' : ''}`} onClick={() => { setRecipeOpen(false); beginProfileDrawing('revolve') }}><RotateCw size={17} /><span><strong>Draw & revolve</strong><small>Spin a profile around its left edge</small></span></button>
        </div>}
      </div>}

      {task === 'sculpt' && <div id="sculpt-tools-panel" role="tabpanel" aria-labelledby="sculpt-tools-tab" className="toolbox-section sculpt-section">
        <div className="section-title"><span className="section-kicker">Shape your surface</span></div>
        <div className={`sculpt-ready-card ${isSculptMesh ? 'ready' : ''}`}>
          <div><strong>{isSculptMesh ? selectedNode.name : selectedNode ? `Sculpt ${selectedNode.name}` : 'Start with a shape'}</strong><small>{isSculptMesh ? `${Math.round((selectedNode.mesh?.indices.length ?? 0) / 3).toLocaleString()} faces · choose a brush, then drag on the surface.` : selectedNode ? 'Turn this shape into an editable surface. You can undo the conversion.' : 'Add or select a shape in your model, then convert it to use surface brushes.'}</small></div>
          {!isSculptMesh && (selectedNode ? <button disabled={selectedNode.locked} onClick={() => makeSculptable(2)}><Sparkles size={14} /> Convert to sculpt mesh</button> : <button onClick={() => setTask('build')}><Box size={14} /> Browse shapes</button>)}
        </div>

        <div className="sculpt-subhead"><span>Volume brushes</span></div>{volumeLocked && <p className="sculpt-gesture-tip">Unlock all shapes before volume sculpting. Volume brushes affect the combined model.</p>}
        <div className="sculpt-tools-grid">
          <IconButton disabled={volumeLocked} active={tool === 'sculpt-add'} icon={<Sparkles size={18} />} label="Volume add" onClick={() => setTool('sculpt-add')} />
          <IconButton disabled={volumeLocked} active={tool === 'sculpt-carve'} icon={<WandSparkles size={18} />} label="Volume carve" onClick={() => setTool('sculpt-carve')} />
        </div>

        {isSculptMesh && <><div className="sculpt-subhead"><span>Surface brushes</span></div>
        <div className="sculpt-tools-grid polygon-tools-grid">
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-grab'} icon={<Hand size={18} />} label="Grab" onClick={() => setTool('sculpt-grab')} />
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-clay'} icon={<Sparkles size={18} />} label="Clay strips" onClick={() => setTool('sculpt-clay')} />
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-smooth'} icon={<Waves size={18} />} label="Smooth" onClick={() => setTool('sculpt-smooth')} />
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-crease'} icon={<Minimize2 size={18} />} label="Crease" onClick={() => setTool('sculpt-crease')} />
        </div>
        <details className="advanced-modeling-tools"><summary>More brushes <ChevronDown size={15} /></summary><div className="sculpt-tools-grid polygon-tools-grid">
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-draw'} icon={<WandSparkles size={18} />} label="Draw" onClick={() => setTool('sculpt-draw')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-inflate'} icon={<CirclePlus size={18} />} label="Inflate" onClick={() => setTool('sculpt-inflate')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-pinch'} icon={<Minimize2 size={18} />} label="Pinch" onClick={() => setTool('sculpt-pinch')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-flatten'} icon={<PanelTopClose size={18} />} label="Flatten" onClick={() => setTool('sculpt-flatten')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-snake'} icon={<RotateCw size={18} />} label="Snake hook" onClick={() => setTool('sculpt-snake')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-relax'} icon={<Blend size={18} />} label="Relax" onClick={() => setTool('sculpt-relax')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-mask'} icon={<CircleDot size={18} />} label="Mask paint" onClick={() => setTool('sculpt-mask')} />
        </div></details></>}
        <div className="brush-settings">
          <label><span><Radius size={13} /> Radius</span><span className="brush-value"><input aria-label="Brush radius" type="number" min="0.5" max="24" step="0.1" value={Number(brushRadius.toFixed(1))} onChange={(event) => setBrushSetting({ brushRadius: Math.max(0.5, Math.min(24, Number(event.target.value))) })} />mm</span><input aria-label="Brush radius slider" type="range" min="0.5" max="24" step="0.1" value={brushRadius} onChange={(event) => setBrushSetting({ brushRadius: Number(event.target.value) })} /></label>
          <label><span><Gauge size={13} /> Strength</span><span className="brush-value"><input aria-label="Brush strength" type="number" min="1" max="100" step="1" value={Math.round(brushStrength * 100)} onChange={(event) => setBrushSetting({ brushStrength: Math.max(0.01, Math.min(1, Number(event.target.value) / 100)) })} />%</span><input aria-label="Brush strength slider" type="range" min="0.01" max="1" step="0.01" value={brushStrength} onChange={(event) => setBrushSetting({ brushStrength: Number(event.target.value) })} /></label>
          <details className="advanced-modeling-tools advanced-brush-settings"><summary>Brush settings <ChevronDown size={15} /></summary><div className="advanced-brush-fields">
            <label><span><Blend size={13} /> Spacing</span><span className="brush-value"><input aria-label="Brush spacing" type="number" min="5" max="100" step="1" value={Math.round(brushSpacing * 100)} onChange={(event) => setBrushSetting({ brushSpacing: Math.max(0.05, Math.min(1, Number(event.target.value) / 100)) })} />%</span><input aria-label="Brush spacing slider" type="range" min="0.05" max="1" step="0.01" value={brushSpacing} onChange={(event) => setBrushSetting({ brushSpacing: Number(event.target.value) })} /></label>
            <div className="falloff-control"><span>Falloff</span><div>{(['smooth', 'sharp', 'flat'] as const).map((falloff) => <button key={falloff} aria-pressed={brushFalloff === falloff} className={brushFalloff === falloff ? 'active' : ''} onClick={() => setBrushSetting({ brushFalloff: falloff })}>{falloff}</button>)}</div></div>
            <div className="axis-symmetry"><span><FlipHorizontal2 size={14} /> Mirror stroke</span><div>{(['X', 'Y', 'Z'] as const).map((axis) => { const active = axis === 'X' ? brushSymmetryX : axis === 'Y' ? brushSymmetryY : brushSymmetryZ; return <button key={axis} aria-label={`Mirror strokes on ${axis}`} aria-pressed={active} className={active ? 'active' : ''} onClick={() => setBrushSetting(axis === 'X' ? { brushSymmetryX: !active } : axis === 'Y' ? { brushSymmetryY: !active } : { brushSymmetryZ: !active })}>{axis}</button> })}</div></div>
            {!isVolumeBrush && <><button className={`symmetry-toggle ${brushFrontFacesOnly ? 'active' : ''}`} onClick={() => setBrushSetting({ brushFrontFacesOnly: !brushFrontFacesOnly })}><CircleDot size={15} /><span>Front faces only</span><i>{brushFrontFacesOnly ? 'On' : 'Off'}</i></button>
            <button className={`symmetry-toggle ${dynamicTopology ? 'active' : ''}`} onClick={() => setBrushSetting({ dynamicTopology: !dynamicTopology })}><Triangle size={15} /><span>Adaptive detail</span><i>{dynamicTopology ? 'On' : 'Off'}</i></button>
            {dynamicTopology && <label><span><Triangle size={13} /> Detail size</span><span className="brush-value">{Math.round(sculptDetail * 100)}%</span><input aria-label="Sculpt detail size" type="range" min="0.15" max="1" step="0.05" value={sculptDetail} onChange={(event) => setBrushSetting({ sculptDetail: Number(event.target.value) })} /></label>}
            <div className="sculpt-mesh-actions"><button disabled={!isSculptMesh} onClick={subdivideSelectedMesh}>Subdivide all</button><button disabled={!isSculptMesh} onClick={invertSculptMask}>Invert mask</button><button disabled={!isSculptMesh} onClick={clearSculptMask}>Clear mask</button></div></>}
          </div></details>
          {(isSculptMesh || isVolumeBrush) && <small className="sculpt-gesture-tip"><strong>Shift</strong> inverts draw/carve and erases mask. One Undo step is stored per drag.</small>}
        </div>
      </div>}
    </aside>
  )
}
