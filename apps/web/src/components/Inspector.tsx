import { Copy, Eye, EyeOff, Lock, Search, Trash2, Unlock, BoxSelect, Printer, ArrowDownToLine, FlipHorizontal2, Grid2X2Plus, History, RotateCw, Combine, Scissors, ScanLine, Ungroup, Palette, Spline, ArrowUp, ArrowDown, Power, Layers3, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ModelNode, TransformValue, Vec3Value } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { IconButton } from './IconButton'
import { NodeParameterBindings, ParameterPanel } from './ParameterEditors'
import { SketchConstraintEditor } from './SketchConstraintEditor'
import { MeshComponentEditor } from './MeshComponentEditor'
import { ProfileEditor } from './ProfileEditor'
import { PrintPanel } from './PrintPanel'
import { HistoryPanel } from './HistoryPanel'
import { NumberInput } from './NumberInput'
import { selectionNeedsUniformScale } from '@/lib/selectionTransforms'
import { makeSourceGeometry } from '@/lib/modelGeometry'
import './InspectorReview.css'
import { CadToolsPanel } from './CadToolsPanel'
import { SectionPanel } from './SectionPanel'
import { SplitPanel } from './SplitPanel'
import { PlatePlacementPanel } from './PlatePlacementPanel'

function VectorFields({ label, value, onChange, suffix }: { label: string; value: Vec3Value; onChange: (value: Vec3Value) => void; suffix?: string }) {
  return (
    <div className="vector-fields">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <NumberInput key={axis} label={axis.toUpperCase()} accessibleLabel={`${label} ${axis.toUpperCase()}`} value={value[axis]} suffix={suffix} allowZero={label !== 'Scale'} onChange={(next) => onChange({ ...value, [axis]: next })} />
      ))}
    </div>
  )
}

function ShapeInspector({ node }: { node: ModelNode }) {
  const [patternAxis, setPatternAxis] = useState<'x' | 'y' | 'z'>('x')
  const [patternCount, setPatternCount] = useState(3)
  const [patternSpacing, setPatternSpacing] = useState(12)
  const [polarDegrees, setPolarDegrees] = useState(360)
  const [polarRadius, setPolarRadius] = useState(30)
  const updateNode = useEditor((state) => state.updateNode)
  const documentUnit = useEditor((state) => state.document.units)
  const mirrorSelected = useEditor((state) => state.mirrorSelected)
  const patternSelected = useEditor((state) => state.patternSelected)
  const polarPatternSelected = useEditor((state) => state.polarPatternSelected)
  const transform = node.transform
  const updateTransform = (part: keyof TransformValue, value: Vec3Value) => updateNode(node.id, { transform: { ...transform, [part]: value } })
  const updateParameter = (key: keyof ModelNode['parameters'], value: number) => updateNode(node.id, { parameters: { ...node.parameters, [key]: key === 'segments' ? Math.max(8, Math.min(256, Math.round(value))) : key === 'count' ? Math.max(1, Math.min(256, Math.round(value))) : key === 'twist' ? value : Math.max(['radiusTop', 'fillet', 'wall'].includes(key) ? 0 : 0.1, value) } })
  const updateSurface = (key: keyof NonNullable<ModelNode['surface']>, value: number) => updateNode(node.id, { surface: { smoothAngle: 0, refineLength: 0, simplifyTolerance: 0, hollowThickness: 0, ...node.surface, [key]: Math.max(0, value) } })
  const [proportional, setProportional] = useState(false)
  const localSize = useMemo(() => {
    const geometry = makeSourceGeometry(node)
    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox!
    const size = { x: bounds.max.x - bounds.min.x, y: bounds.max.y - bounds.min.y, z: bounds.max.z - bounds.min.z }
    geometry.dispose()
    return size
  }, [node])
  const dimensions = { x: localSize.x * Math.abs(transform.scale.x), y: localSize.y * Math.abs(transform.scale.y), z: localSize.z * Math.abs(transform.scale.z) }
  const resizeDimension = (axis: 'x' | 'y' | 'z', next: number) => {
    if (next <= 0 || dimensions[axis] <= 0) return
    const factor = next / dimensions[axis]
    updateTransform('scale', proportional ? { x: transform.scale.x * factor, y: transform.scale.y * factor, z: transform.scale.z * factor } : { ...transform.scale, [axis]: transform.scale[axis] * factor })
  }
  const dropToPlate = useEditor(state => state.dropSelectionToPlate)
  const swatches = [
    '#f7f7f2', '#d9d9d6', '#8b8d92', '#424754', '#17191f',
    '#ff5f68', '#ff8a9a', '#ff6d32', '#f5b85f', '#f5df62',
    '#76d66f', '#6fd6b4', '#3fc7c9', '#53a7ff', '#829eff',
    '#666de8', '#b994ff', '#e277d5', '#a97452', '#d4a373',
  ]

  return (
    <fieldset className="inspector-content shape-properties" disabled={node.locked}>
      <div className="inspector-heading">
        <input aria-label="Shape name" value={node.name} onChange={(event) => updateNode(node.id, { name: event.target.value || 'Shape' })} />
        <span className={`boolean-pill ${node.boolean}`}>{node.boolean === 'add' ? 'Solid' : node.boolean === 'cut' ? 'Carve' : 'Intersect'}</span>
      </div>

      {node.locked && <p className="locked-note"><Lock size={13} /> Locked. Use the lock beside the shape to edit.</p>}
      <div className="property-group dimensions-editor">
        <h3>Dimensions <small>mm</small></h3>
        {Object.values(transform.rotation).some(value => Math.abs(value) > 0.001) && <p className="local-dimensions-note">Along this shape’s own axes, before rotation. Print shows the final overall size.</p>}
        <div className="vector-fields">{(['x', 'y', 'z'] as const).map((axis, index) => <NumberInput key={axis} label={['Width', 'Depth', 'Height'][index]!} value={dimensions[axis]} suffix="mm" min={0.01} onChange={value => resizeDimension(axis, value)} />)}</div>
        <label className="proportions-toggle"><input type="checkbox" checked={proportional} onChange={event => setProportional(event.target.checked)} /> Keep proportions</label>
        <p className="numeric-entry-tip">Tip: enter 1/2 in, 2 cm, or 25.4 / 2. Values are shown in mm.</p>
      </div>
      <div className="property-group shape-role-editor">
        <h3>Shape role</h3>
        <div role="group" aria-label="Shape boolean role">
          <button aria-pressed={node.boolean === 'add'} className={node.boolean === 'add' ? 'active' : ''} onClick={() => updateNode(node.id, { boolean: 'add' })}><Combine size={14} /><strong>Solid</strong></button>
          <button aria-pressed={node.boolean === 'cut'} className={node.boolean === 'cut' ? 'active' : ''} onClick={() => updateNode(node.id, { boolean: 'cut' })}><Scissors size={14} /><strong>Hole</strong></button>
          <button aria-pressed={node.boolean === 'intersect'} className={node.boolean === 'intersect' ? 'active' : ''} onClick={() => updateNode(node.id, { boolean: 'intersect' })}><ScanLine size={14} /><strong>Overlap</strong></button>
        </div>
        <small>Select several shapes to apply a boolean operation.</small>
      </div>

      <div className="property-group">
        <h3>Position</h3>
        <VectorFields label="Position" value={transform.position} suffix="mm" onChange={(value) => updateTransform('position', value)} />
      </div>
      <div className="property-group">
        <h3>Rotation</h3>
        <VectorFields label="Rotation" value={transform.rotation} suffix="°" onChange={(value) => updateTransform('rotation', value)} />
      </div>
      <div className="property-group">
        <h3>Scale</h3>
        <VectorFields label="Scale" value={transform.scale} onChange={(value) => updateTransform('scale', value)} />
      </div>
      <details className="property-group shape-settings">
        <summary>Shape settings</summary>
        <div className="size-fields">
          {node.kind === 'mesh' ? <p className="imported-mesh-note">Dimensions and Scale resize the imported mesh. Open Advanced for vertex, edge, and face editing.</p> : node.kind === 'extrude' ? <NumberInput label="H" value={node.parameters.height} suffix="mm" onChange={(value) => updateParameter('height', value)} /> : node.kind === 'revolve' ? <NumberInput label="Segments" value={node.parameters.segments} onChange={(value) => updateParameter('segments', value)} /> : node.kind === 'box' || node.kind === 'roundedBox' || node.kind === 'wedge' ? <>
            <NumberInput label="W" value={node.parameters.width} suffix="mm" onChange={(value) => updateParameter('width', value)} />
            <NumberInput label="D" value={node.parameters.depth} suffix="mm" onChange={(value) => updateParameter('depth', value)} />
            <NumberInput label="H" value={node.parameters.height} suffix="mm" onChange={(value) => updateParameter('height', value)} />
            {node.kind === 'roundedBox' && <NumberInput label="Corner" value={node.parameters.fillet} suffix="mm" onChange={(value) => updateParameter('fillet', value)} />}
          </> : node.kind === 'loft' ? <>
            <NumberInput label="Base W" value={node.parameters.width} suffix="mm" onChange={(value) => updateParameter('width', value)} />
            <NumberInput label="Base D" value={node.parameters.depth} suffix="mm" onChange={(value) => updateParameter('depth', value)} />
            <NumberInput label="Top W" value={node.parameters.topWidth} suffix="mm" onChange={(value) => updateParameter('topWidth', value)} />
            <NumberInput label="Top D" value={node.parameters.topDepth} suffix="mm" onChange={(value) => updateParameter('topDepth', value)} />
            <NumberInput label="H" value={node.parameters.height} suffix="mm" onChange={(value) => updateParameter('height', value)} />
            <NumberInput label="Twist" value={node.parameters.twist} suffix="°" onChange={(value) => updateParameter('twist', value)} />
          </> : node.kind === 'gear' || node.kind === 'spring' ? <>
            <NumberInput label={node.kind === 'gear' ? 'Outer' : 'Coil R'} value={node.parameters.radius} suffix="mm" onChange={(value) => updateParameter('radius', value)} />
            <NumberInput label={node.kind === 'gear' ? 'Root' : 'Wire R'} value={node.parameters.radiusTop} suffix="mm" onChange={(value) => updateParameter('radiusTop', value)} />
            <NumberInput label={node.kind === 'gear' ? 'Teeth' : 'Turns'} value={node.parameters.count} onChange={(value) => updateParameter('count', value)} />
            <NumberInput label="H" value={node.parameters.height} suffix="mm" onChange={(value) => updateParameter('height', value)} />
          </> : <>
            <NumberInput label="R" value={node.parameters.radius} suffix="mm" onChange={(value) => updateParameter('radius', value)} />
            {['cone', 'torus', 'tube', 'star'].includes(node.kind) && <NumberInput label={node.kind === 'cone' ? 'Top' : node.kind === 'tube' ? 'Inner' : 'Minor'} value={node.parameters.radiusTop} suffix="mm" onChange={(value) => updateParameter('radiusTop', value)} />}
            {!['sphere', 'torus'].includes(node.kind) && <NumberInput label="H" value={node.parameters.height} suffix="mm" onChange={(value) => updateParameter('height', value)} />}
          </>}
        </div>
      </details>
      {node.mesh && <div className="pro-property"><MeshComponentEditor /></div>}
      {(node.kind === 'extrude' || node.kind === 'revolve') && <>
        <ProfileEditor node={node} unit={documentUnit} onUpdate={(patch) => updateNode(node.id, patch)} />
        <div className="pro-property"><SketchConstraintEditor node={node} unit={documentUnit} onUpdate={(patch) => updateNode(node.id, patch)} /></div>
      </>}
      <div className="property-group pro-property layer-editor">
        <h3><Layers3 size={13} /> Layer</h3>
        <input aria-label="Shape layer" value={node.layer ?? 'Default'} onChange={(event) => updateNode(node.id, { layer: event.target.value || 'Default' })} placeholder="Default" />
      </div>
      <div className="property-group material-editor">
        <h3><Palette size={13} /> Color & print material</h3>
        <div className="color-row"><input aria-label="Custom object color" type="color" value={node.color} onChange={(event) => updateNode(node.id, { color: event.target.value })} />{swatches.map((color) => <button key={color} aria-label={`Set shape color to ${color}`} aria-pressed={node.color === color} className={node.color === color ? 'active' : ''} style={{ background: color }} title={color} onClick={() => updateNode(node.id, { color })} />)}</div>
        <div className="ams-slots"><span>Print color</span>{[1, 2, 3, 4].map((slot) => <button key={slot} aria-label={`Print material slot ${slot}`} aria-pressed={node.materialSlot === slot} className={node.materialSlot === slot ? 'active' : ''} onClick={() => updateNode(node.id, { materialSlot: slot })}><i style={{ background: node.materialSlot === slot ? node.color : undefined }} />{slot}</button>)}</div>
      </div>
      <div className="property-group pro-property deform-editor">
        <h3><Spline size={13} /> Deform mesh</h3>
        <div className="deform-row"><select aria-label="Mesh deformation type" value={node.deformation?.kind ?? 'none'} onChange={(event) => updateNode(node.id, { deformation: { kind: event.target.value as NonNullable<ModelNode['deformation']>['kind'], amount: node.deformation?.amount ?? 0 } })}><option value="none">None</option><option value="taper">Taper</option><option value="twist">Twist</option><option value="bend">Bend</option></select><input aria-label={`Deformation amount (${node.deformation?.kind === 'twist' ? 'degrees' : 'percent'})`} type="number" value={node.deformation?.amount ?? 0} step="5" onChange={(event) => updateNode(node.id, { deformation: { kind: node.deformation?.kind ?? 'taper', amount: Number(event.target.value) } })} /><em>{node.deformation?.kind === 'twist' ? '°' : '%'}</em></div>
        <input aria-label="Deformation amount" type="range" min="-180" max="180" step="1" value={node.deformation?.amount ?? 0} onChange={(event) => updateNode(node.id, { deformation: { kind: node.deformation?.kind ?? 'taper', amount: Number(event.target.value) } }, false)} />
      </div>
      <div className="property-group pro-property surface-editor">
        <h3><Sparkles size={13} /> Surface modifiers</h3>
        <div className="size-fields">
          <NumberInput label="Smooth angle" value={node.surface?.smoothAngle ?? 0} suffix="°" onChange={(value) => updateSurface('smoothAngle', value)} />
          <NumberInput label="Refine edge" value={node.surface?.refineLength ?? 0} suffix="mm" onChange={(value) => updateSurface('refineLength', value)} />
          <NumberInput label="Simplify" value={node.surface?.simplifyTolerance ?? 0} suffix="mm" onChange={(value) => updateSurface('simplifyTolerance', value)} />
          <NumberInput label="Hollow" value={node.surface?.hollowThickness ?? 0} suffix="mm" onChange={(value) => updateSurface('hollowThickness', value)} />
        </div>
        <small>Set a value to zero to disable it. Hollow subtracts a scaled inner copy; wall thickness varies with shape.</small>
      </div>
      <NodeParameterBindings node={node} />
      <div className="property-group object-actions">
        <h3>Quick actions</h3>
        <button onClick={dropToPlate}><ArrowDownToLine size={14} /> Drop to plate</button>
      </div>
      <div className="property-group pro-property repeat-tools">
        <h3>Mirror & pattern</h3>
        <div className="axis-actions">
          {(['x', 'y', 'z'] as const).map((axis) => <button key={axis} onClick={() => mirrorSelected(axis)}><FlipHorizontal2 size={13} /> Mirror {axis.toUpperCase()}</button>)}
        </div>
        <div className="pattern-row">
          <label><span>Axis</span><select aria-label="Linear pattern axis" value={patternAxis} onChange={(event) => setPatternAxis(event.target.value as 'x' | 'y' | 'z')}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
          <label><span>Total parts</span><input aria-label="Linear pattern total parts" type="number" min="2" max="20" value={patternCount} onChange={(event) => setPatternCount(Number(event.target.value))} /></label>
          <label><span>Spacing</span><div><input aria-label="Linear pattern spacing (millimeters)" type="number" min="0.1" step="0.1" value={patternSpacing} onChange={(event) => setPatternSpacing(Number(event.target.value))} /><em>mm</em></div></label>
        </div>
        <button className="pattern-apply" onClick={() => patternSelected(patternAxis, patternCount, patternSpacing)}><Grid2X2Plus size={14} /> Create linear pattern</button>
        <div className="pattern-row polar-row">
          <label><span>Axis</span><select aria-label="Polar pattern axis" value={patternAxis} onChange={(event) => setPatternAxis(event.target.value as 'x' | 'y' | 'z')}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
          <label><span>Total parts</span><input aria-label="Polar pattern total parts" type="number" min="2" max="36" value={patternCount} onChange={(event) => setPatternCount(Number(event.target.value))} /></label>
          <label><span>Arc</span><div><input aria-label="Polar pattern arc (degrees)" type="number" min="1" max="360" step="1" value={polarDegrees} onChange={(event) => setPolarDegrees(Number(event.target.value))} /><em>°</em></div></label>
        </div>
        <div className="polar-radius"><span>Pattern radius</span><div><input aria-label="Polar pattern radius (millimeters)" type="number" min="0.1" step="0.5" value={polarRadius} onChange={(event) => setPolarRadius(Number(event.target.value))} /><em>mm</em></div></div>
        <button className="pattern-apply" onClick={() => polarPatternSelected(patternAxis, patternCount, polarDegrees, polarRadius)}><RotateCw size={14} /> Create polar pattern</button>
      </div>
    </fieldset>
  )
}

function SelectionActions({ count }: { count: number }) {
  const uniformScale = useEditor(state => selectionNeedsUniformScale(state.document.nodes.filter(node => state.selectedNodeIds.includes(node.id))))
  const base = useEditor(state => state.document.nodes.find(node => node.id === state.selectedNodeIds[0]))
  const locked = useEditor(state => state.document.nodes.some(node => state.selectedNodeIds.includes(node.id) && node.locked))
  const combineSelected = useEditor((state) => state.combineSelected)
  const ungroupSelected = useEditor((state) => state.ungroupSelected)
  const alignSelected = useEditor((state) => state.alignSelected)
  const distributeSelected = useEditor((state) => state.distributeSelected)
  return <div className="selection-actions">
    <div><strong>{count} shapes selected</strong><span>Move, rotate, or scale together using the active shape as the pivot.</span></div>
    {uniformScale && <p className="selection-scale-note">Different rotations: scaling keeps proportions for the whole selection. Select one shape to scale a single axis.</p>}
    <fieldset disabled={locked} className="boolean-actions">
      <button onClick={() => combineSelected('union')}><Combine size={17} /><strong>Union</strong><span>Join volumes</span></button>
      <button onClick={() => combineSelected('subtract')}><Scissors size={17} /><strong>Subtract</strong><span>Keep {base?.name}; cut the rest</span></button>
      <button onClick={() => combineSelected('intersect')}><ScanLine size={17} /><strong>Intersect</strong><span>Keep overlap</span></button>
      <button onClick={() => combineSelected('hull')}><Spline size={17} /><strong>Hull</strong><span>Wrap selection</span></button>
    </fieldset>
    {locked && <p className="locked-note">Unlock shapes before combining.</p>}
    <button className="ungroup-action" onClick={ungroupSelected}><Ungroup size={15} /> Separate combined parts</button>
    <div className="selection-layout-tools">
      <strong>Align to {base?.name ?? 'first selected'}</strong>
      {(['x', 'y', 'z'] as const).map((axis) => <div key={axis}><span>{axis.toUpperCase()}</span><button aria-label={`Align ${axis.toUpperCase()} minimum`} onClick={() => alignSelected(axis, 'min')}>Min</button><button aria-label={`Align ${axis.toUpperCase()} centers`} onClick={() => alignSelected(axis, 'center')}>Center</button><button aria-label={`Align ${axis.toUpperCase()} maximum`} onClick={() => alignSelected(axis, 'max')}>Max</button><button aria-label={`Distribute along ${axis.toUpperCase()}`} disabled={count < 3} onClick={() => distributeSelected(axis)}>Distribute</button></div>)}
    </div>
  </div>
}

export function Inspector() {
  const [panel, setPanel] = useState<'model' | 'parameters' | 'print' | 'history' | 'tools'>('model')
  const [toolkitTab, setToolkitTab] = useState<'create' | 'inspect' | 'prepare'>('create')
  const [featureQuery, setFeatureQuery] = useState('')
  const [multiSelect, setMultiSelect] = useState(false)
  const document = useEditor((state) => state.document)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const selectedNodeIds = useEditor((state) => state.selectedNodeIds)
  const selectNode = useEditor((state) => state.selectNode)
  const updateNode = useEditor((state) => state.updateNode)
  const duplicateSelected = useEditor((state) => state.duplicateSelected)
  const removeSelected = useEditor((state) => state.removeSelected)
  const moveFeature = useEditor((state) => state.moveFeature)
  const selected = document.nodes.find((node) => node.id === selectedNodeId)
  const matchingNodes = document.nodes.map((node, index) => ({ node, index })).filter(({ node }) => `${node.name} ${node.kind} ${node.layer ?? ''}`.toLowerCase().includes(featureQuery.trim().toLowerCase()))

  useEffect(() => { setFeatureQuery('') }, [document.id])
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; toolkit?: 'create' | 'inspect' | 'prepare' }>).detail
      const tab = detail?.tab
      if (tab === 'model' || tab === 'print' || tab === 'history' || tab === 'tools' || tab === 'parameters') setPanel(tab)
      if (detail?.toolkit) setToolkitTab(detail.toolkit)
    }
    window.addEventListener('formforge:open-inspector', open)
    return () => window.removeEventListener('formforge:open-inspector', open)
  }, [])

  useEffect(() => {
    if (document.workspaceMode === 'simple' && panel === 'parameters') setPanel('model')
  }, [document.workspaceMode, panel])

  return (
    <aside aria-label="Model inspector" className={`inspector inspector-review panel-surface ${document.workspaceMode === 'simple' ? 'simple-inspector' : ''}`}>
      <div className="panel-title-row">
        <div className="inspector-tabs" role="group" aria-label="Inspector panels"><button aria-pressed={panel === 'model'} className={panel === 'model' ? 'active' : ''} onClick={() => setPanel('model')}><BoxSelect size={14} /> Model</button>{document.workspaceMode === 'pro' && <button aria-pressed={panel === 'parameters'} aria-label="Parameters" className={panel === 'parameters' ? 'active' : ''} onClick={() => setPanel('parameters')}><span className="parameter-tab-icon" aria-hidden="true">{'{}'}</span> Params</button>}<button aria-pressed={panel === 'print'} className={panel === 'print' ? 'active' : ''} onClick={() => setPanel('print')}><Printer size={14} /> Print</button><button aria-pressed={panel === 'history'} className={panel === 'history' ? 'active' : ''} onClick={() => setPanel('history')}><History size={14} /> History</button></div>
      </div>
      <button className={`cad-toolkit-trigger ${panel === 'tools' ? 'active' : ''}`} aria-pressed={panel === 'tools'} onClick={() => setPanel('tools')}><Sparkles size={15} /><strong>CAD toolkit</strong><span>Holes · fits · sections · split</span></button>
      {panel === 'tools' ? <div className="inspector-workflow cad-toolkit-workflow">
        <div className="toolkit-navigation" role="group" aria-label="CAD workflow"><button aria-pressed={toolkitTab === 'create'} onClick={() => setToolkitTab('create')}>Create</button><button aria-pressed={toolkitTab === 'inspect'} onClick={() => setToolkitTab('inspect')}>Inspect</button><button aria-pressed={toolkitTab === 'prepare'} onClick={() => setToolkitTab('prepare')}>Prepare</button></div>
        {toolkitTab === 'create' ? <CadToolsPanel key={document.id} /> : toolkitTab === 'inspect' ? <><SectionPanel /><section className="workflow-card"><h3>Measure the visible mesh</h3><p>Choose mesh vertices for corners or surface points for free measurements. The canvas readout shows distance and X/Y/Z offsets.</p><button className="workflow-action secondary" onClick={() => { useEditor.getState().setTool('measure'); useEditor.getState().setMeasurement(null) }}>Start measuring</button></section></> : <><PlatePlacementPanel /><details className="cad-toolkit-details"><summary>Split into printable pieces</summary><SectionPanel /><SplitPanel /></details></>}
      </div> : panel === 'print' ? <PrintPanel /> : panel === 'history' ? <HistoryPanel /> : panel === 'parameters' ? <ParameterPanel key={document.id} /> : <>
      <div className="feature-list-heading"><h2>Shapes</h2><span>{document.nodes.length}</span><button className="multi-select-toggle" type="button" aria-label="Select multiple shapes" aria-pressed={multiSelect} onClick={() => setMultiSelect(!multiSelect)}><BoxSelect size={14} /> Multi-select</button></div>
      {document.nodes.length > 0 && <label className="feature-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Find shapes by name, type, or layer" placeholder="Find a shape…" value={featureQuery} onChange={(event) => setFeatureQuery(event.target.value)} /></label>}
      <div className="feature-list" role="list" aria-label="Project shapes">
        {matchingNodes.map(({ node, index }) => (
          <div key={node.id} role="listitem" className={`feature-row ${selectedNodeIds.includes(node.id) ? 'selected' : ''} ${node.suppressed ? 'suppressed' : ''}`}>
            <button type="button" className="feature-select" aria-label={`Select ${node.name}`} aria-pressed={selectedNodeIds.includes(node.id)} onClick={(event) => selectNode(node.id, multiSelect || event.ctrlKey || event.metaKey || event.shiftKey)}>
              <span aria-hidden="true" className={`feature-icon ${node.boolean}`}>{node.boolean === 'add' ? index + 1 : node.boolean === 'cut' ? '−' : '∩'}</span>
              <span className="feature-name"><strong>{node.name}</strong><small>{node.kind} · {node.suppressed ? 'suppressed' : node.combined ? 'combined' : node.boolean === 'add' ? 'solid' : node.boolean === 'cut' ? 'hole' : 'overlap'}</small></span>
            </button>
            <div className="feature-actions" role="group" aria-label={`Actions for ${node.name}`}>
              <button type="button" aria-label={`Move ${node.name} earlier`} title="Move shape earlier" disabled={index === 0} onClick={() => moveFeature(node.id, -1)}><ArrowUp size={14} /></button>
              <button type="button" aria-label={`Move ${node.name} later`} title="Move shape later" disabled={index === document.nodes.length - 1} onClick={() => moveFeature(node.id, 1)}><ArrowDown size={14} /></button>
              <button type="button" aria-label={`${node.visible ? 'Hide' : 'Show'} ${node.name}`} title={node.visible ? 'Hide shape' : 'Show shape'} onClick={() => updateNode(node.id, { visible: !node.visible })}>{node.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
              <button type="button" aria-label={`${node.suppressed ? 'Enable' : 'Suppress'} ${node.name}`} title={node.suppressed ? 'Enable modeling step' : 'Suppress modeling step'} onClick={() => updateNode(node.id, { suppressed: !node.suppressed })}><Power size={14} /></button>
              <button type="button" aria-label={`${node.locked ? 'Unlock' : 'Lock'} ${node.name}`} title={node.locked ? 'Unlock shape' : 'Lock shape'} onClick={() => updateNode(node.id, { locked: !node.locked })}>{node.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
            </div>
          </div>
        ))}
      </div>
      {document.nodes.length > 0 && matchingNodes.length === 0 && <div className="feature-search-empty" role="status"><span>No shapes match “{featureQuery}”.</span><button type="button" onClick={() => setFeatureQuery('')}>Clear search</button></div>}

      {selected ? <>
        {selectedNodeIds.length > 1 ? <SelectionActions count={selectedNodeIds.length} /> : <ShapeInspector key={selected.id} node={selected} />}
        <div className="inspector-footer">
          <IconButton compact icon={<Copy size={17} />} label="Duplicate" onClick={duplicateSelected} />
          <IconButton compact icon={<Trash2 size={17} />} label="Delete" className="danger" onClick={removeSelected} />
        </div>
      </> : (
        <div className="empty-inspector"><BoxSelect size={28} aria-hidden="true" /><strong>{document.nodes.length ? 'Select a shape' : 'Your model starts here'}</strong><p>{document.nodes.length ? 'Choose a shape here or in the canvas to edit its size, position, and color. Hold Shift to select several.' : 'Add a shape from Build, then select it to set dimensions and make it your own.'}</p></div>
      )}
      </>}
    </aside>
  )
}
