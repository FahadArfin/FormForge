import { useState } from 'react'
import { Box, CircleDot, Grid2X2, MousePointer2, ShieldCheck } from 'lucide-react'
import { useEditor, type MeshComponentMode } from '@/store/editor'

type EditableMode = Exclude<MeshComponentMode, 'object'>
type SelectionStrategy = 'contained' | 'touching'
type TransformKind = 'move' | 'rotate' | 'scale'
type TransformVector = { x: number; y: number; z: number }

const editableModes: readonly {
  mode: EditableMode
  label: string
  hint: string
  icon: typeof CircleDot
}[] = [
  { mode: 'vertex', label: 'Points', hint: 'Select and shape individual corners', icon: CircleDot },
  { mode: 'edge', label: 'Edges', hint: 'Select the lines between points', icon: Grid2X2 },
  { mode: 'face', label: 'Faces', hint: 'Select polygon surfaces', icon: Box },
]

const distanceOptions = [
  { value: 'surface', label: 'Along surface' },
  { value: 'topological', label: 'By edge steps' },
  { value: 'euclidean', label: 'Straight line' },
] as const

const falloffOptions = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'linear', label: 'Linear' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'constant', label: 'Constant' },
] as const

function finiteNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function MeshComponentEditor() {
  const [selectionStrategy, setSelectionStrategy] = useState<SelectionStrategy>('touching')
  const [transformKind, setTransformKind] = useState<TransformKind>('move')
  const [delta, setDelta] = useState({ x: 0, y: 0, z: 0 })
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 })
  const [scale, setScale] = useState({ x: 1, y: 1, z: 1 })
  const [extrudeDistance, setExtrudeDistance] = useState(1)
  const [insetFraction, setInsetFraction] = useState(0.2)

  const hasEditableMesh = useEditor((state) => Boolean(state.document.nodes.find((node) => node.id === state.selectedNodeId)?.mesh))
  const mode = useEditor((state) => state.meshComponentMode)
  const selectedVertices = useEditor((state) => state.selectedMeshVertices)
  const selectedEdges = useEditor((state) => state.selectedMeshEdges)
  const selectedFaces = useEditor((state) => state.selectedMeshFaces)
  const softSelectionRadius = useEditor((state) => state.softSelectionRadius)
  const softSelectionDistance = useEditor((state) => state.softSelectionDistance)
  const softSelectionFalloff = useEditor((state) => state.softSelectionFalloff)

  const setMode = useEditor((state) => state.setMeshComponentMode)
  const convertSelection = useEditor((state) => state.convertMeshComponentSelection)
  const selectAll = useEditor((state) => state.selectAllMeshComponents)
  const clearSelection = useEditor((state) => state.clearMeshComponentSelection)
  const growSelection = useEditor((state) => state.growMeshComponentSelection)
  const shrinkSelection = useEditor((state) => state.shrinkMeshComponentSelection)
  const selectLinked = useEditor((state) => state.selectLinkedMeshComponents)
  const selectBoundary = useEditor((state) => state.selectMeshBoundary)
  const selectShortestPath = useEditor((state) => state.selectMeshShortestPath)
  const selectEdgeLoop = useEditor((state) => state.selectMeshEdgeLoop)
  const setEditSetting = useEditor((state) => state.setComponentEditSetting)
  const transformSelection = useEditor((state) => state.transformMeshComponents)
  const extrudeFaces = useEditor((state) => state.extrudeSelectedFaces)
  const insetFace = useEditor((state) => state.insetSelectedFace)
  const deleteFaces = useEditor((state) => state.deleteSelectedMeshComponents)
  const dissolveVertex = useEditor((state) => state.dissolveSelectedVertex)

  const selectionCount = mode === 'vertex'
    ? selectedVertices.length
    : mode === 'edge' ? selectedEdges.length : mode === 'face' ? selectedFaces.length : 0
  const selectionNoun = mode === 'vertex'
    ? selectionCount === 1 ? 'vertex' : 'vertices'
    : mode === 'edge' ? selectionCount === 1 ? 'edge' : 'edges'
      : selectionCount === 1 ? 'face' : 'faces'
  const editingComponents = mode !== 'object' && hasEditableMesh

  const chooseMode = (nextMode: MeshComponentMode) => {
    if (nextMode === 'object') {
      setMode('object')
      return
    }
    if (!hasEditableMesh || nextMode === mode) return
    if (mode === 'object') setMode(nextMode)
    else convertSelection(nextMode, selectionStrategy)
  }

  const activeTransform: TransformVector = transformKind === 'move' ? delta : transformKind === 'rotate' ? rotation : scale
  const transformUnit = transformKind === 'move' ? 'mm' : transformKind === 'rotate' ? 'deg' : '×'
  const transformStep = transformKind === 'move' ? 0.1 : transformKind === 'rotate' ? 1 : 0.05
  const transformChanged = transformKind === 'scale'
    ? scale.x !== 1 || scale.y !== 1 || scale.z !== 1
    : activeTransform.x !== 0 || activeTransform.y !== 0 || activeTransform.z !== 0

  const setTransformAxis = (axis: 'x' | 'y' | 'z', value: string) => {
    if (transformKind === 'move') setDelta((current) => ({ ...current, [axis]: finiteNumber(value) }))
    else if (transformKind === 'rotate') setRotation((current) => ({ ...current, [axis]: finiteNumber(value) }))
    else setScale((current) => ({ ...current, [axis]: finiteNumber(value, 1) }))
  }

  const applyTransform = () => {
    if (transformKind === 'move') transformSelection({ translation: delta })
    else if (transformKind === 'rotate') transformSelection({ rotation })
    else transformSelection({ scale })
  }

  return (
    <section className="mesh-component-editor" aria-label="Polygon component editor">
      <div className="mesh-component-heading">
        <div className="mesh-component-heading-copy">
          <strong>Edit the mesh</strong>
          <span>Choose what you want to reshape, then click it in the model.</span>
        </div>
        <output className="mesh-component-selection-count" aria-live="polite">
          {mode === 'object' ? 'Object mode' : `${selectionCount} ${selectionNoun} selected`}
        </output>
      </div>

      <div className="mesh-component-mode-grid" role="group" aria-label="Mesh selection mode">
        <button
          type="button"
          className={`mesh-component-mode-button${mode === 'object' ? ' mesh-component-active' : ''}`}
          aria-pressed={mode === 'object'}
          onClick={() => chooseMode('object')}
          title="Move and transform the complete object"
        >
          <MousePointer2 size={15} />
          <span><strong>Object</strong><small>Whole shape</small></span>
        </button>
        {editableModes.map(({ mode: editableMode, label, hint, icon: Icon }) => (
          <button
            type="button"
            key={editableMode}
            className={`mesh-component-mode-button${mode === editableMode ? ' mesh-component-active' : ''}`}
            aria-pressed={mode === editableMode}
            disabled={!hasEditableMesh}
            onClick={() => chooseMode(editableMode)}
            title={hint}
          >
            <Icon size={15} />
            <span><strong>{label}</strong><small>{editableMode === 'vertex' ? 'Corners' : editableMode === 'edge' ? 'Lines' : 'Surfaces'}</small></span>
          </button>
        ))}
      </div>

      {!hasEditableMesh && (
        <p className="mesh-component-empty-note">
          Select an editable mesh, or make a parametric shape sculptable, to edit its points, edges, and faces.
        </p>
      )}

      <div className="mesh-component-selection-toolbar" role="group" aria-label="Selection commands">
        <button type="button" disabled={!editingComponents} onClick={selectAll}>Select all</button>
        <button type="button" disabled={!editingComponents || selectionCount === 0} onClick={clearSelection}>Clear</button>
        <button type="button" disabled={!editingComponents || selectionCount === 0} onClick={growSelection} title="Add neighboring components">Grow</button>
        <button type="button" disabled={!editingComponents || selectionCount === 0} onClick={shrinkSelection} title="Remove the selection boundary">Shrink</button>
        <button type="button" disabled={!editingComponents || selectionCount === 0} onClick={selectLinked} title="Select the whole connected mesh island">Linked</button>
        <button type="button" disabled={!editingComponents} onClick={selectBoundary} title="Select open edges in this mesh or island">Boundary</button>
        <button type="button" disabled={!editingComponents || (mode !== 'vertex' && mode !== 'edge') || selectionCount !== 2} onClick={selectShortestPath} title="Select the shortest connected route between two vertices or edges">Path</button>
        <button type="button" disabled={!editingComponents || mode !== 'edge' || selectionCount !== 1} onClick={selectEdgeLoop} title="Follow opposite edges through an unambiguous quad loop">Loop</button>
      </div>

      <label className="mesh-component-compact-field mesh-component-conversion-field">
        <span>When switching selection types</span>
        <select
          value={selectionStrategy}
          disabled={!editingComponents}
          onChange={(event) => setSelectionStrategy(event.target.value as SelectionStrategy)}
          title="Controls how the mode buttons convert the current selection"
        >
          <option value="touching">Include anything touching</option>
          <option value="contained">Only fully contained</option>
        </select>
      </label>

      <div className="mesh-component-section">
        <div className="mesh-component-section-title">
          <strong>Precision transform</strong>
          <span>Move, rotate, or scale selected components around their shared center.</span>
        </div>
        <div className="mesh-component-transform-tabs" role="group" aria-label="Component transform type">
          {(['move', 'rotate', 'scale'] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              className={transformKind === kind ? 'mesh-component-active' : ''}
              aria-pressed={transformKind === kind}
              onClick={() => setTransformKind(kind)}
            >
              {kind === 'move' ? 'Move' : kind === 'rotate' ? 'Rotate' : 'Scale'}
            </button>
          ))}
        </div>
        <div className="mesh-component-vector-fields">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <label className={`mesh-component-axis-field mesh-component-axis-${axis}`} key={axis}>
              <span>{axis.toUpperCase()}</span>
              <input
                type="number"
                step={transformStep}
                value={activeTransform[axis]}
                disabled={!editingComponents}
                onChange={(event) => setTransformAxis(axis, event.target.value)}
                aria-label={`${transformKind} ${axis.toUpperCase()} ${transformUnit}`}
              />
              <em>{transformUnit}</em>
            </label>
          ))}
          <button
            type="button"
            className="mesh-component-primary-action"
            disabled={!editingComponents || selectionCount === 0 || !transformChanged}
            onClick={applyTransform}
          >
            Apply {transformKind}
          </button>
        </div>
      </div>

      <details className="mesh-component-expert-section" open>
        <summary className="mesh-component-expert-summary">
          <span><strong>Soft selection</strong><small>Move nearby points naturally</small></span>
        </summary>
        <div className="mesh-component-expert-controls">
          <label className="mesh-component-compact-field">
            <span>Radius</span>
            <div className="mesh-component-input-with-unit">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={softSelectionRadius}
                disabled={!editingComponents}
                onChange={(event) => setEditSetting({ softSelectionRadius: finiteNumber(event.target.value) })}
              />
              <em>mm</em>
            </div>
            <small>Set to 0 to affect only selected points.</small>
          </label>
          <label className="mesh-component-compact-field">
            <span>Distance</span>
            <select
              value={softSelectionDistance}
              disabled={!editingComponents || softSelectionRadius === 0}
              onChange={(event) => setEditSetting({ softSelectionDistance: event.target.value as typeof softSelectionDistance })}
            >
              {distanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="mesh-component-compact-field">
            <span>Falloff</span>
            <select
              value={softSelectionFalloff}
              disabled={!editingComponents || softSelectionRadius === 0}
              onChange={(event) => setEditSetting({ softSelectionFalloff: event.target.value as typeof softSelectionFalloff })}
            >
              {falloffOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </details>

      {mode === 'face' && (
        <div className="mesh-component-section mesh-component-face-tools">
          <div className="mesh-component-section-title">
            <strong>Build from faces</strong>
            <span>Pull out a surface or create a smaller face inside it.</span>
          </div>
          <div className="mesh-component-operation-row">
            <label className="mesh-component-compact-field">
              <span>Extrude distance</span>
              <div className="mesh-component-input-with-unit">
                <input type="number" step="0.5" value={extrudeDistance} onChange={(event) => setExtrudeDistance(finiteNumber(event.target.value))} />
                <em>mm</em>
              </div>
            </label>
            <button type="button" disabled={!hasEditableMesh || selectionCount === 0 || extrudeDistance === 0} onClick={() => extrudeFaces(extrudeDistance)}>Extrude selected</button>
          </div>
          <div className="mesh-component-operation-row">
            <label className="mesh-component-compact-field">
              <span>Inset fraction</span>
              <input
                type="number"
                min="0.01"
                max="0.99"
                step="0.05"
                value={insetFraction}
                onChange={(event) => setInsetFraction(Math.min(0.99, Math.max(0.01, finiteNumber(event.target.value, 0.2))))}
              />
            </label>
            <button type="button" disabled={!hasEditableMesh || selectionCount !== 1} onClick={() => insetFace(insetFraction)}>Inset one face</button>
          </div>
          <button
            type="button"
            className="mesh-component-danger-action"
            disabled={!hasEditableMesh || selectionCount === 0}
            onClick={deleteFaces}
            title="Delete only when the remaining topology is manifold"
          >
            Delete selected faces
          </button>
        </div>
      )}

      {mode === 'vertex' && (
        <div className="mesh-component-section mesh-component-vertex-tools">
          <div className="mesh-component-section-title">
            <strong>Clean up a point</strong>
            <span>Dissolve one three-edge point without opening the solid.</span>
          </div>
          <button type="button" disabled={!hasEditableMesh || selectionCount !== 1} onClick={dissolveVertex}>
            Dissolve selected point
          </button>
        </div>
      )}

      <p className="mesh-component-safety-note" role="note">
        <ShieldCheck size={15} />
        <span><strong>Manifold-safe editing</strong> Extrude and inset preserve a closed solid. Delete and dissolve are refused if they would create invalid topology.</span>
      </p>
    </section>
  )
}

export default MeshComponentEditor
