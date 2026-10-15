import { useState } from 'react'
import type { ModelNode } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useResizeScale } from '@/store/resizePreview'
import { shapeDimensions, resizeNodeDimension } from '@/lib/selectionDimensions'
import { NumberInput } from './NumberInput'

/** Shared sidebar controls for Modeling and Engineering. */
export function ShapeDimensions({ node, onManipulate }: { node: ModelNode; onManipulate?: () => void }) {
  const tool = useEditor(state => state.tool)
  const placing = useEditor(state => state.placingNodeId)
  const setTool = useEditor(state => state.setTool)
  const updateNode = useEditor(state => state.updateNode)
  const previewScale = useResizeScale(node.id)
  const [proportional, setProportional] = useState(false)
  const [error, setError] = useState('')
  const dimensions = shapeDimensions(node, previewScale)
  if (placing) return null
  return <div className="property-group dimensions-editor">
    <h3>Dimensions <small>mm</small></h3>
    <div className="shape-direct-actions" role="group" aria-label="Shape manipulation">
      <button type="button" disabled={node.locked} aria-pressed={tool === 'select' || tool === 'move'} onClick={() => { setTool('select'); onManipulate?.() }}>Move shape</button>
      <button type="button" disabled={node.locked} aria-pressed={tool === 'scale'} onClick={() => { setTool('scale'); onManipulate?.() }}>Resize shape</button>
    </div>
    {Object.values(node.transform.rotation).some(value => Math.abs(value) > 0.001) && <p className="local-dimensions-note">Along this shape’s own axes, before rotation. Print shows the final overall size.</p>}
    <div className="vector-fields">{(['x', 'y', 'z'] as const).map((axis, index) => <NumberInput key={axis} label={['Width', 'Depth', 'Height'][index]!} value={dimensions[axis]} suffix="mm" min={0.01} disabled={node.locked} onChange={value => {
      try { updateNode(node.id, { transform: resizeNodeDimension(node, axis, value, proportional) }); setError('') }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to resize this shape.') }
    }} />)}</div>
    <label className="proportions-toggle"><input type="checkbox" disabled={node.locked} checked={proportional} onChange={event => setProportional(event.target.checked)} /> Keep proportions</label>
    <p className="numeric-entry-tip">Tip: enter 1/2 in, 2 cm, or 25.4 / 2. Values are shown in mm.</p>
    {error && <p role="alert">{error}</p>}
  </div>
}
