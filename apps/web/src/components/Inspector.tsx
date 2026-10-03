import { Copy, Eye, EyeOff, Lock, Search, Trash2, Unlock, BoxSelect, Printer, CheckCircle2, AlertTriangle, ArrowDownToLine, FlipHorizontal2, Grid2X2Plus, History, RotateCcw, RotateCw, Combine, Scissors, ScanLine, Ungroup, Palette, Spline, ArrowUp, ArrowDown, Power, Wrench, Layers3, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ModelNode, TransformValue, Vec3Value } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { listVersions, type ProjectVersion } from '@/lib/db'
import { IconButton } from './IconButton'
import { analyzeMesh } from '@/lib/meshTools'
import { NodeParameterBindings, ParameterPanel } from './ParameterEditors'
import { SketchConstraintEditor } from './SketchConstraintEditor'
import { MeshComponentEditor } from './MeshComponentEditor'
import { ProfileEditor } from './ProfileEditor'

function NumberInput({ label, accessibleLabel, value, onChange, suffix }: { label: string; accessibleLabel?: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  const dimensions: Record<string, string> = { W: 'Width', D: 'Depth', H: 'Height', R: 'Radius', 'Base W': 'Base width', 'Base D': 'Base depth', 'Top W': 'Top width', 'Top D': 'Top depth', 'Coil R': 'Coil radius', 'Wire R': 'Wire radius', Outer: 'Outer radius', Root: 'Root radius', Top: 'Top radius', Inner: 'Inner radius', Minor: 'Minor radius' }
  const name = accessibleLabel ?? dimensions[label] ?? label
  return (
    <label className="number-field">
      <span>{label}</span>
      <div><input aria-label={`${name}${suffix ? ` (${suffix === 'mm' ? 'millimeters' : suffix === '°' ? 'degrees' : suffix})` : ''}`} type="number" step="0.5" value={Number(value.toFixed(2))} onChange={(event) => onChange(Number(event.target.value))} />{suffix && <em>{suffix}</em>}</div>
    </label>
  )
}

function VectorFields({ label, value, onChange, suffix }: { label: string; value: Vec3Value; onChange: (value: Vec3Value) => void; suffix?: string }) {
  return (
    <div className="vector-fields">
      {(['x', 'y', 'z'] as const).map((axis) => (
        <NumberInput key={axis} label={axis.toUpperCase()} accessibleLabel={`${label} ${axis.toUpperCase()}`} value={value[axis]} suffix={suffix} onChange={(next) => onChange({ ...value, [axis]: next })} />
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
  const dropToPlate = () => {
    if (node.kind === 'mesh') return
    const halfHeight = node.kind === 'sphere' ? node.parameters.radius * Math.abs(transform.scale.z) : node.parameters.height * Math.abs(transform.scale.z) / 2
    updateTransform('position', { ...transform.position, z: halfHeight })
  }
  const swatches = [
    '#f7f7f2', '#d9d9d6', '#8b8d92', '#424754', '#17191f',
    '#ff5f68', '#ff8a9a', '#ff6d32', '#f5b85f', '#f5df62',
    '#76d66f', '#6fd6b4', '#3fc7c9', '#53a7ff', '#829eff',
    '#666de8', '#b994ff', '#e277d5', '#a97452', '#d4a373',
  ]

  return (
    <div className="inspector-content">
      <div className="inspector-heading">
        <input aria-label="Shape name" value={node.name} onChange={(event) => updateNode(node.id, { name: event.target.value || 'Shape' })} />
        <span className={`boolean-pill ${node.boolean}`}>{node.boolean === 'add' ? 'Solid' : node.boolean === 'cut' ? 'Carve' : 'Intersect'}</span>
      </div>

      <div className="property-group shape-role-editor">
        <h3>How this shape combines</h3>
        <div role="group" aria-label="Shape boolean role">
          <button aria-pressed={node.boolean === 'add'} className={node.boolean === 'add' ? 'active' : ''} onClick={() => updateNode(node.id, { boolean: 'add' })}><Combine size={14} /><strong>Solid</strong><span>Include this shape</span></button>
          <button aria-pressed={node.boolean === 'cut'} className={node.boolean === 'cut' ? 'active' : ''} onClick={() => updateNode(node.id, { boolean: 'cut' })}><Scissors size={14} /><strong>Hole</strong><span>Exclude its volume</span></button>
          <button aria-pressed={node.boolean === 'intersect'} className={node.boolean === 'intersect' ? 'active' : ''} onClick={() => updateNode(node.id, { boolean: 'intersect' })}><ScanLine size={14} /><strong>Overlap</strong><span>Keep shared volume</span></button>
        </div>
        <small>Shapes stay independently editable until you explicitly combine a multi-selection.</small>
      </div>

      <div className="property-group">
        <h3>Position</h3>
        <VectorFields label="Position" value={transform.position} suffix="mm" onChange={(value) => updateTransform('position', value)} />
      </div>
      <div className="property-group pro-property">
        <h3>Rotation</h3>
        <VectorFields label="Rotation" value={transform.rotation} suffix="°" onChange={(value) => updateTransform('rotation', value)} />
      </div>
      <div className="property-group pro-property">
        <h3>Scale</h3>
        <VectorFields label="Scale" value={transform.scale} onChange={(value) => updateTransform('scale', value)} />
      </div>
      <div className="property-group">
        <h3>Size</h3>
        <div className="size-fields">
          {node.kind === 'mesh' ? <p className="imported-mesh-note">Imported mesh dimensions follow the Scale controls above.</p> : node.kind === 'extrude' ? <NumberInput label="H" value={node.parameters.height} suffix="mm" onChange={(value) => updateParameter('height', value)} /> : node.kind === 'revolve' ? <NumberInput label="Segments" value={node.parameters.segments} onChange={(value) => updateParameter('segments', value)} /> : node.kind === 'box' || node.kind === 'roundedBox' || node.kind === 'wedge' ? <>
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
      </div>
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
        <small>Modifiers stay editable in the feature timeline. Set a value to zero to disable it.</small>
      </div>
      <NodeParameterBindings node={node} />
      <div className="property-group object-actions">
        <h3>Quick actions</h3>
        {node.kind !== 'mesh' && <button onClick={dropToPlate}><ArrowDownToLine size={14} /> Drop to plate</button>}
      </div>
      <div className="property-group pro-property repeat-tools">
        <h3>Mirror & pattern</h3>
        <div className="axis-actions">
          {(['x', 'y', 'z'] as const).map((axis) => <button key={axis} onClick={() => mirrorSelected(axis)}><FlipHorizontal2 size={13} /> Mirror {axis.toUpperCase()}</button>)}
        </div>
        <div className="pattern-row">
          <label><span>Axis</span><select aria-label="Linear pattern axis" value={patternAxis} onChange={(event) => setPatternAxis(event.target.value as 'x' | 'y' | 'z')}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
          <label><span>Copies</span><input aria-label="Linear pattern copies" type="number" min="2" max="20" value={patternCount} onChange={(event) => setPatternCount(Number(event.target.value))} /></label>
          <label><span>Spacing</span><div><input aria-label="Linear pattern spacing (millimeters)" type="number" min="0.1" step="0.1" value={patternSpacing} onChange={(event) => setPatternSpacing(Number(event.target.value))} /><em>mm</em></div></label>
        </div>
        <button className="pattern-apply" onClick={() => patternSelected(patternAxis, patternCount, patternSpacing)}><Grid2X2Plus size={14} /> Create linear pattern</button>
        <div className="pattern-row polar-row">
          <label><span>Axis</span><select aria-label="Polar pattern axis" value={patternAxis} onChange={(event) => setPatternAxis(event.target.value as 'x' | 'y' | 'z')}><option value="x">X</option><option value="y">Y</option><option value="z">Z</option></select></label>
          <label><span>Copies</span><input aria-label="Polar pattern copies" type="number" min="2" max="36" value={patternCount} onChange={(event) => setPatternCount(Number(event.target.value))} /></label>
          <label><span>Arc</span><div><input aria-label="Polar pattern arc (degrees)" type="number" min="1" max="360" step="1" value={polarDegrees} onChange={(event) => setPolarDegrees(Number(event.target.value))} /><em>°</em></div></label>
        </div>
        <div className="polar-radius"><span>Pattern radius</span><div><input aria-label="Polar pattern radius (millimeters)" type="number" min="0.1" step="0.5" value={polarRadius} onChange={(event) => setPolarRadius(Number(event.target.value))} /><em>mm</em></div></div>
        <button className="pattern-apply" onClick={() => polarPatternSelected(patternAxis, patternCount, polarDegrees, polarRadius)}><RotateCw size={14} /> Create polar pattern</button>
      </div>
    </div>
  )
}

function SelectionActions({ count }: { count: number }) {
  const combineSelected = useEditor((state) => state.combineSelected)
  const ungroupSelected = useEditor((state) => state.ungroupSelected)
  const alignSelected = useEditor((state) => state.alignSelected)
  const distributeSelected = useEditor((state) => state.distributeSelected)
  return <div className="selection-actions">
    <div><strong>{count} shapes selected</strong><span>Choose how the parts should become one model.</span></div>
    <div className="boolean-actions">
      <button onClick={() => combineSelected('union')}><Combine size={17} /><strong>Union</strong><span>Join volumes</span></button>
      <button onClick={() => combineSelected('subtract')}><Scissors size={17} /><strong>Subtract</strong><span>First minus rest</span></button>
      <button onClick={() => combineSelected('intersect')}><ScanLine size={17} /><strong>Intersect</strong><span>Keep overlap</span></button>
      <button onClick={() => combineSelected('hull')}><Spline size={17} /><strong>Hull</strong><span>Wrap selection</span></button>
    </div>
    <button className="ungroup-action" onClick={ungroupSelected}><Ungroup size={15} /> Separate combined parts</button>
    <div className="selection-layout-tools">
      <strong>Align to first selected</strong>
      {(['x', 'y', 'z'] as const).map((axis) => <div key={axis}><span>{axis.toUpperCase()}</span><button aria-label={`Align ${axis.toUpperCase()} minimum`} onClick={() => alignSelected(axis, 'min')}>Min</button><button aria-label={`Align ${axis.toUpperCase()} centers`} onClick={() => alignSelected(axis, 'center')}>Center</button><button aria-label={`Align ${axis.toUpperCase()} maximum`} onClick={() => alignSelected(axis, 'max')}>Max</button><button aria-label={`Distribute along ${axis.toUpperCase()}`} disabled={count < 3} onClick={() => distributeSelected(axis)}>Distribute</button></div>)}
    </div>
  </div>
}

function PrintPanel() {
  const analysis = useEditor((state) => state.analysis)
  const document = useEditor((state) => state.document)
  const selectedNodeId = useEditor((state) => state.selectedNodeId)
  const repairSelectedMesh = useEditor((state) => state.repairSelectedMesh)
  const selectedMesh = document.nodes.find((node) => node.id === selectedNodeId)?.mesh
  const diagnostics = selectedMesh ? analyzeMesh(selectedMesh) : null
  if (!analysis) return <div className="empty-inspector"><strong>Analyzing model…</strong></div>
  const ready = analysis.status === 'ready'
  return (
    <div className="print-panel">
      <div className={`print-hero ${analysis.status}`}>
        {ready ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
        <div><strong>{ready ? 'Ready for the slicer' : analysis.status === 'blocked' ? 'Fix before exporting' : 'Printable with warnings'}</strong><span>{document.printer.name} · {document.units}</span></div>
      </div>
      <div className="print-metrics">
        <div><span>Size X</span><strong>{analysis.dimensions.x.toFixed(2)} mm</strong></div>
        <div><span>Size Y</span><strong>{analysis.dimensions.y.toFixed(2)} mm</strong></div>
        <div><span>Size Z</span><strong>{analysis.dimensions.z.toFixed(2)} mm</strong></div>
        <div><span>Volume</span><strong>{analysis.volume.toFixed(0)} mm³</strong></div>
        <div><span>Triangles</span><strong>{analysis.triangleCount.toLocaleString()}</strong></div>
        <div><span>Min wall</span><strong>{document.printer.minimumWall} mm</strong></div>
      </div>
      <div className="analysis-list">
        <h3>Checks</h3>
        {analysis.issues.length ? analysis.issues.map((issue) => <div className={`analysis-issue ${issue.severity}`} key={issue.id}><AlertTriangle size={15} /><div><strong>{issue.title}</strong><span>{issue.description}</span></div></div>) : <div className="analysis-issue passed"><CheckCircle2 size={15} /><div><strong>Solid mesh</strong><span>No blocking print issues detected.</span></div></div>}
      </div>
      {diagnostics && <div className="mesh-diagnostics">
        <h3>Imported mesh topology</h3>
        <div><span>Vertices</span><strong>{diagnostics.vertexCount.toLocaleString()}</strong><span>Boundary edges</span><strong>{diagnostics.boundaryEdges.toLocaleString()}</strong><span>Invalid faces</span><strong>{(diagnostics.degenerateTriangles + diagnostics.duplicateTriangles).toLocaleString()}</strong><span>Non-manifold</span><strong>{diagnostics.nonManifoldEdges.toLocaleString()}</strong></div>
        <p className={diagnostics.watertight ? 'watertight' : 'open'}>{diagnostics.watertight ? 'Watertight closed mesh' : 'Open or non-manifold mesh detected'}</p>
        <button onClick={repairSelectedMesh}><Wrench size={14} /> Weld & clean selected mesh</button>
      </div>}
      <p className="analysis-note">These checks catch common geometry and build-volume problems. Confirm supports and final orientation in your slicer.</p>
    </div>
  )
}

function HistoryPanel() {
  const document = useEditor((state) => state.document)
  const importDocument = useEditor((state) => state.importDocument)
  const setNotice = useEditor((state) => state.setNotice)
  const [versions, setVersions] = useState<ProjectVersion[]>([])

  useEffect(() => {
    const refresh = () => void listVersions(document.id).then(setVersions)
    refresh()
    window.addEventListener('formforge:version-saved', refresh)
    return () => window.removeEventListener('formforge:version-saved', refresh)
  }, [document.id])

  const restore = (version: ProjectVersion) => {
    importDocument({ ...structuredClone(version.document), updatedAt: new Date().toISOString() })
    setNotice(`Restored ${version.label}.`)
  }

  return <div className="history-panel">
    <div className="history-intro"><History size={21} /><div><strong>Local checkpoints</strong><span>Save a checkpoint from Project actions beside your project name.</span></div></div>
    {versions.length ? <div className="version-list">{versions.map((version) => <article key={version.id}>
      <div><strong>{version.label}</strong><span>{new Date(version.createdAt).toLocaleString()} · {version.document.nodes.length} features</span></div>
      <button aria-label={`Restore ${version.label}`} title="Restore checkpoint" onClick={() => restore(version)}><RotateCcw size={14} /> Restore</button>
    </article>)}</div> : <div className="empty-history"><strong>No checkpoints yet</strong><span>Open File and choose Save checkpoint.</span></div>}
  </div>
}

export function Inspector() {
  const [panel, setPanel] = useState<'model' | 'parameters' | 'print' | 'history'>('model')
  const [featureQuery, setFeatureQuery] = useState('')
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
    if (document.workspaceMode === 'simple' && panel === 'parameters') setPanel('model')
  }, [document.workspaceMode, panel])

  return (
    <aside aria-label="Model inspector" className={`inspector panel-surface ${document.workspaceMode === 'simple' ? 'simple-inspector' : ''}`}>
      <div className="panel-title-row">
        <div className="inspector-tabs" role="group" aria-label="Inspector panels"><button aria-pressed={panel === 'model'} className={panel === 'model' ? 'active' : ''} onClick={() => setPanel('model')}><BoxSelect size={14} /> Model</button>{document.workspaceMode === 'pro' && <button aria-pressed={panel === 'parameters'} aria-label="Parameters" className={panel === 'parameters' ? 'active' : ''} onClick={() => setPanel('parameters')}><span className="parameter-tab-icon" aria-hidden="true">{'{}'}</span> Params</button>}<button aria-pressed={panel === 'print'} className={panel === 'print' ? 'active' : ''} onClick={() => setPanel('print')}><Printer size={14} /> Print</button><button aria-pressed={panel === 'history'} className={panel === 'history' ? 'active' : ''} onClick={() => setPanel('history')}><History size={14} /> History</button></div>
      </div>
      {panel === 'print' ? <PrintPanel /> : panel === 'history' ? <HistoryPanel /> : panel === 'parameters' ? <ParameterPanel /> : <>
      <div className="feature-list-heading"><h2>Shapes</h2><span>{document.nodes.length}{selectedNodeIds.length > 0 ? ` · ${selectedNodeIds.length} selected` : ''}</span></div>
      {document.nodes.length > 0 && <label className="feature-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Find shapes by name, type, or layer" placeholder="Find a shape…" value={featureQuery} onChange={(event) => setFeatureQuery(event.target.value)} /></label>}
      <div className="feature-list" role="list" aria-label="Project shapes">
        {matchingNodes.map(({ node, index }) => (
          <div key={node.id} role="listitem" className={`feature-row ${selectedNodeIds.includes(node.id) ? 'selected' : ''} ${node.suppressed ? 'suppressed' : ''}`}>
            <button type="button" className="feature-select" aria-label={`Select ${node.name}`} aria-pressed={selectedNodeIds.includes(node.id)} onClick={(event) => selectNode(node.id, event.ctrlKey || event.metaKey || event.shiftKey)}>
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
        {selectedNodeIds.length > 1 ? <SelectionActions count={selectedNodeIds.length} /> : <ShapeInspector node={selected} />}
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
