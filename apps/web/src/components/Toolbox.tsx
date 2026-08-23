import { useState } from 'react'
import { Box, CircleDot, Cone, Cylinder, Hand, MousePointer2, RotateCw, Scaling, Sparkles, Waves, WandSparkles, Radius, Gauge, Blend, FlipHorizontal2, PenTool, CircleDashed, Pill, Triangle, Star, CirclePlus, Minimize2, PanelTopClose } from 'lucide-react'
import type { ModelNode, PrimitiveKind, ToolMode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { IconButton } from './IconButton'
import { ProfileRecipeCreator } from './ProfileRecipeCreator'

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

const tools: { value: ToolMode; label: string; icon: typeof Hand }[] = [
  { value: 'select', label: 'Select', icon: MousePointer2 },
  { value: 'move', label: 'Move', icon: Hand },
  { value: 'rotate', label: 'Rotate', icon: RotateCw },
  { value: 'scale', label: 'Scale', icon: Scaling },
]

const defaultParameters: ModelNode['parameters'] = { width: 20, depth: 20, height: 20, radius: 10, radiusTop: 4, segments: 48, fillet: 2, count: 12, twist: 0, topWidth: 12, topDepth: 12, wall: 0 }

export function Toolbox() {
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
  const isSculptMesh = selectedNode?.kind === 'mesh' && Boolean(selectedNode.mesh)

  const setParameter = (key: keyof ModelNode['parameters'], value: number) => setParameters((current) => ({ ...current, [key]: Math.max(key === 'radiusTop' ? 0 : 0.1, value) }))
  const field = (label: string, key: keyof ModelNode['parameters'], suffix = 'mm') => <label><span>{label}</span><div><input aria-label={`${label} dimension`} type="number" step="0.5" value={parameters[key]} onChange={(event) => setParameter(key, Number(event.target.value))} />{suffix && <em>{suffix}</em>}</div></label>

  return (
    <aside className="toolbox panel-surface">
      <div className="toolbox-section">
        <div className="section-title"><span className="section-kicker">Create shape</span><small>choose, size, place</small></div>
        <div className="shape-library">
          {shapes.map(({ kind, label, icon: Icon }) => (
            <button key={kind} className={shape === kind ? 'active' : ''} onClick={() => { setShape(kind); setRecipeOpen(false) }} title={label}><Icon size={18} /><span>{label}</span></button>
          ))}
        </div>
        {shape && <div className="shape-setup">
          <div className="shape-setup-head"><strong>{shapes.find((item) => item.kind === shape)?.label}</strong><button onClick={() => setShape(null)}>×</button></div>
          <div className="solid-kind-switch"><button className={boolean === 'add' ? 'active' : ''} onClick={() => setBoolean('add')}>Solid</button><button className={boolean === 'cut' ? 'active carve' : ''} onClick={() => setBoolean('cut')}>Carve</button></div>
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
          <small className="shape-setup-tip">Click once to keep these exact dimensions, or drag to resize the footprint.</small>
        </div>}
        <button
          className={`profile-recipe-launch ${recipeOpen ? 'active' : ''}`}
          type="button"
          aria-expanded={recipeOpen}
          onClick={() => { setRecipeOpen((current) => !current); setShape(null) }}
        >
          <WandSparkles size={17} />
          <span><strong>Outline recipes</strong><small>Complex exact shapes, without drawing</small></span>
          <i>{recipeOpen ? 'Close' : 'Open'}</i>
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
      </div>

      <div className="toolbox-section toolbox-section--compact">
        <span className="section-kicker">Transform</span>
        <div className="tool-row">
          {tools.map(({ value, label, icon: Icon }) => (
            <IconButton key={value} compact active={tool === value} icon={<Icon size={19} />} label={label} onClick={() => setTool(value)} />
          ))}
        </div>
      </div>

      <div className="toolbox-section sculpt-section">
        <div className="section-title"><span className="section-kicker">Sculpt studio</span><small>Blender-style, browser-fast</small></div>
        <div className={`sculpt-ready-card ${isSculptMesh ? 'ready' : ''}`}>
          <div><strong>{isSculptMesh ? 'Polygon Sculpt active' : 'Ready for polygon sculpt?'}</strong><small>{isSculptMesh ? `${Math.round((selectedNode.mesh?.indices.length ?? 0) / 3).toLocaleString()} faces · strokes edit the mesh live` : 'Bake the visible model into a detailed editable surface. Undo restores your construction.'}</small></div>
          {!isSculptMesh && <button onClick={() => makeSculptable(2)}><Sparkles size={14} /> Start Polygon Sculpt</button>}
        </div>

        <div className="sculpt-subhead"><span>Volume block-out</span><small>fast large forms</small></div>
        <div className="sculpt-tools-grid">
          <IconButton active={tool === 'sculpt-add'} icon={<Sparkles size={18} />} label="Volume add" onClick={() => setTool('sculpt-add')} />
          <IconButton active={tool === 'sculpt-carve'} icon={<WandSparkles size={18} />} label="Volume carve" onClick={() => setTool('sculpt-carve')} />
        </div>

        <div className="sculpt-subhead"><span>Polygon brushes</span><small>{workspaceMode === 'pro' ? 'full toolset' : 'beginner essentials'}</small></div>
        <div className="sculpt-tools-grid polygon-tools-grid">
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-grab'} icon={<Hand size={18} />} label="Grab" onClick={() => setTool('sculpt-grab')} />
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-clay'} icon={<Sparkles size={18} />} label="Clay strips" onClick={() => setTool('sculpt-clay')} />
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-smooth'} icon={<Waves size={18} />} label="Smooth" onClick={() => setTool('sculpt-smooth')} />
          <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-crease'} icon={<Minimize2 size={18} />} label="Crease" onClick={() => setTool('sculpt-crease')} />
          {workspaceMode === 'pro' && <>
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-draw'} icon={<WandSparkles size={18} />} label="Draw" onClick={() => setTool('sculpt-draw')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-inflate'} icon={<CirclePlus size={18} />} label="Inflate" onClick={() => setTool('sculpt-inflate')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-pinch'} icon={<Minimize2 size={18} />} label="Pinch" onClick={() => setTool('sculpt-pinch')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-flatten'} icon={<PanelTopClose size={18} />} label="Flatten" onClick={() => setTool('sculpt-flatten')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-snake'} icon={<RotateCw size={18} />} label="Snake hook" onClick={() => setTool('sculpt-snake')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-relax'} icon={<Blend size={18} />} label="Relax" onClick={() => setTool('sculpt-relax')} />
            <IconButton disabled={!isSculptMesh} active={tool === 'sculpt-mask'} icon={<CircleDot size={18} />} label="Mask paint" onClick={() => setTool('sculpt-mask')} />
          </>}
        </div>
        <div className="brush-settings">
          <label><span><Radius size={13} /> Radius</span><span className="brush-value"><input aria-label="Brush radius" type="number" min="0.5" max="24" step="0.1" value={Number(brushRadius.toFixed(1))} onChange={(event) => setBrushSetting({ brushRadius: Math.max(0.5, Math.min(24, Number(event.target.value))) })} />mm</span><input type="range" min="0.5" max="24" step="0.1" value={brushRadius} onChange={(event) => setBrushSetting({ brushRadius: Number(event.target.value) })} /></label>
          <label><span><Gauge size={13} /> Strength</span><span className="brush-value"><input aria-label="Brush strength" type="number" min="1" max="100" step="1" value={Math.round(brushStrength * 100)} onChange={(event) => setBrushSetting({ brushStrength: Math.max(0.01, Math.min(1, Number(event.target.value) / 100)) })} />%</span><input type="range" min="0.01" max="1" step="0.01" value={brushStrength} onChange={(event) => setBrushSetting({ brushStrength: Number(event.target.value) })} /></label>
          {workspaceMode === 'pro' && <>
            <label><span><Blend size={13} /> Spacing</span><span className="brush-value"><input aria-label="Brush spacing" type="number" min="5" max="100" step="1" value={Math.round(brushSpacing * 100)} onChange={(event) => setBrushSetting({ brushSpacing: Math.max(0.05, Math.min(1, Number(event.target.value) / 100)) })} />%</span><input type="range" min="0.05" max="1" step="0.01" value={brushSpacing} onChange={(event) => setBrushSetting({ brushSpacing: Number(event.target.value) })} /></label>
            <div className="falloff-control"><span>Falloff</span><div>{(['smooth', 'sharp', 'flat'] as const).map((falloff) => <button key={falloff} className={brushFalloff === falloff ? 'active' : ''} onClick={() => setBrushSetting({ brushFalloff: falloff })}>{falloff}</button>)}</div></div>
            <div className="axis-symmetry"><span><FlipHorizontal2 size={14} /> Mirror stroke</span><div>{(['X', 'Y', 'Z'] as const).map((axis) => { const active = axis === 'X' ? brushSymmetryX : axis === 'Y' ? brushSymmetryY : brushSymmetryZ; return <button key={axis} className={active ? 'active' : ''} onClick={() => setBrushSetting(axis === 'X' ? { brushSymmetryX: !active } : axis === 'Y' ? { brushSymmetryY: !active } : { brushSymmetryZ: !active })}>{axis}</button> })}</div></div>
            <button className={`symmetry-toggle ${brushFrontFacesOnly ? 'active' : ''}`} onClick={() => setBrushSetting({ brushFrontFacesOnly: !brushFrontFacesOnly })}><CircleDot size={15} /><span>Front faces only</span><i>{brushFrontFacesOnly ? 'On' : 'Off'}</i></button>
            <button className={`symmetry-toggle ${dynamicTopology ? 'active' : ''}`} onClick={() => setBrushSetting({ dynamicTopology: !dynamicTopology })}><Triangle size={15} /><span>Adaptive detail</span><i>{dynamicTopology ? 'On' : 'Off'}</i></button>
            {dynamicTopology && <label><span><Triangle size={13} /> Detail size</span><span className="brush-value">{Math.round(sculptDetail * 100)}%</span><input aria-label="Sculpt detail size" type="range" min="0.15" max="1" step="0.05" value={sculptDetail} onChange={(event) => setBrushSetting({ sculptDetail: Number(event.target.value) })} /></label>}
            <div className="sculpt-mesh-actions"><button disabled={!isSculptMesh} onClick={subdivideSelectedMesh}>Subdivide all</button><button disabled={!isSculptMesh} onClick={invertSculptMask}>Invert mask</button><button disabled={!isSculptMesh} onClick={clearSculptMask}>Clear mask</button></div>
          </>}
          {isSculptMesh && <small className="sculpt-gesture-tip"><strong>Shift</strong> inverts draw/carve and erases mask. One Undo step is stored per drag.</small>}
        </div>
      </div>
    </aside>
  )
}
