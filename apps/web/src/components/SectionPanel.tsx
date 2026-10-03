import { useMemo } from 'react'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { NumberInput } from './NumberInput'
import type { SectionSettings } from '@/lib/sectionView'
import './InspectorWorkflows.css'

export function SectionPanel() {
  const section = useInspection(state => state.section)
  const setSection = useInspection(state => state.setSection)
  const updateSection = (patch: Partial<SectionSettings>) => {
    setSection(patch)
    if (patch.enabled) useEditor.getState().setShowResult(true)
  }
  const mesh = useEditor(state => state.mesh)
  const bounds = useMemo(() => {
    const result = { x: { min: -50, max: 50 }, y: { min: -50, max: 50 }, z: { min: 0, max: 50 } }
    if (!mesh?.positions.length) return result
    for (const [index, axis] of (['x', 'y', 'z'] as const).entries()) {
      let min = Infinity; let max = -Infinity
      for (let i = index; i < mesh.positions.length; i += 3) { min = Math.min(min, mesh.positions[i]!); max = Math.max(max, mesh.positions[i]!) }
      result[axis] = { min, max }
    }
    return result
  }, [mesh])
  const range = bounds[section.axis]
  return <section className="workflow-card section-settings">
    <div className="workflow-card-heading"><h3>Section inspection</h3><button className="workflow-action secondary" aria-pressed={section.enabled} onClick={() => updateSection({ enabled: !section.enabled })}>{section.enabled ? 'Turn off' : 'Enable section'}</button></div>
    <p className="workflow-caption">Look inside your model. This view clips the surface; it does not cut or cap the model. Exports stay complete.</p>
    <label className="cad-select-label">Plane normal <select aria-label="Section axis" value={section.axis} onChange={event => { const axis = event.target.value as 'x' | 'y' | 'z'; setSection({ axis, offset: (bounds[axis].min + bounds[axis].max) / 2 }) }}><option value="x">X · side</option><option value="y">Y · front</option><option value="z">Z · horizontal</option></select></label>
    <NumberInput label="Plane position" suffix="mm" value={section.offset} onChange={offset => setSection({ offset })} />
    <input style={{ width: '100%', margin: '12px 0' }} aria-label="Section position slider" type="range" min={range.min} max={Math.max(range.min + 0.01, range.max)} step="0.01" value={section.offset} onChange={event => updateSection({ offset: Number(event.target.value), enabled: true })} />
    <div className="workflow-actions"><button className="workflow-action secondary" aria-pressed={section.inverted} onClick={() => setSection({ inverted: !section.inverted })}>Flip visible side</button><button className="workflow-action secondary" onClick={() => updateSection({ offset: (range.min + range.max) / 2, enabled: true })}>Middle of model</button></div>
    <p className="workflow-caption">Showing {section.inverted ? 'below' : 'above'} {section.axis.toUpperCase()} = {Number(section.offset.toFixed(3))} mm when enabled.</p>
  </section>
}
