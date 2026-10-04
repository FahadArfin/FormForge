import { useMemo, useState } from 'react'
import type { DimensionAnnotation, Vec3Value } from '@formforge/model'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { angleDegrees, annotationValue, geometryKey, pinAnnotation } from '@/lib/annotations'
import { circleMeasurement } from '@/lib/circleMeasurement'
import './AnnotationsPanel.css'

function circleResult(points: Vec3Value[]) {
  try { return { value: points.length === 3 ? circleMeasurement(points) : null, error: '' } }
  catch (error) { return { value: null, error: (error as Error).message } }
}

const formatDimension = (number: number) => number > 0 && number < .005 ? number.toExponential(2) : number.toFixed(2)

/** Also used beside the canvas so progress remains visible on phones. */
export function CircleMeasurementReadout() {
  const points = useInspection(s => s.circlePoints), mode = useInspection(s => s.measurementMode)
  const current = useEditor(s => s.meshDocument === s.document && s.geometryStatus === 'ready')
  const showResult = useEditor(s => s.showResult)
  const { value: circle, error } = circleResult(points)
  return <div className="circle-measurement-readout">
    <p role="status">{!current ? 'Rebuild the current model before measuring a circle.' : !showResult ? 'Show the evaluated result before picking circle points.' : `${points.length}/3 circle points · ${points.length < 3 ? 'Pick points spread around the same circular edge.' : 'The next pick starts another circle.'}`}</p>
    <div className="workflow-actions">
      <label className="cad-select-label">Pick <select aria-label="Circle measurement picking" value={mode} onChange={event => useInspection.getState().setMeasurementMode(event.target.value as 'surface' | 'vertex')}><option value="vertex">Mesh vertex</option><option value="surface">Surface point</option></select></label>
      <button className="workflow-text-action" disabled={!points.length} onClick={() => useInspection.getState().setCirclePoints([])}>Clear circle points</button>
    </div>
    {current && showResult && circle && <p className="circle-measurement-values">Radius {formatDimension(circle.radius)} mm · Diameter {formatDimension(circle.diameter)} mm · Circumference {formatDimension(circle.circumference)} mm</p>}
    {current && showResult && error && <p role="alert" className="workflow-error">{error}</p>}
    <p className="circle-measurement-note">Three-point mesh estimate. Surface picks follow mesh triangles, not an analytic circle.</p>
  </div>
}

export function AnnotationsPanel() {
  const doc = useEditor(s => s.document), measurement = useEditor(s => s.measurement), tool = useEditor(s => s.tool)
  const current = useEditor(s => s.meshDocument === s.document && s.geometryStatus === 'ready' && s.showResult)
  const points = useInspection(s => s.anglePoints), circlePoints = useInspection(s => s.circlePoints)
  const [label, setLabel] = useState('Dimension'), [error, setError] = useState('')
  const key = useMemo(() => geometryKey(doc), [doc.nodes, doc.sculptStrokes])
  const circle = circleResult(circlePoints).value
  let angle = ''
  try { if (points.length === 3) angle = `${angleDegrees(points).toFixed(2)}°` } catch { /* Keep incomplete or invalid angles unpinnable. */ }
  const pin = (kind: DimensionAnnotation['kind']) => {
    try {
      const state = useEditor.getState(), inspection = useInspection.getState()
      if (kind === 'diameter' && (state.meshDocument !== state.document || state.geometryStatus !== 'ready' || !state.showResult)) throw new Error('Rebuild and show the current evaluated result before pinning a diameter.')
      const picks = kind === 'angle' ? inspection.anglePoints : kind === 'diameter' ? inspection.circlePoints : state.measurement?.complete ? [state.measurement.start, state.measurement.end] : []
      state.dispatch({ type: 'replace-document', document: pinAnnotation(state.document, kind, picks, label) })
      setError('')
    } catch (error) { setError((error as Error).message) }
  }
  return <section className="workflow-card">
    <h3>Dimensions, angles and circles</h3>
    <div className="workflow-actions">
      <button className="workflow-action secondary" onClick={() => { useEditor.getState().setMeasurement(null); useEditor.getState().setTool('measure') }}>Measure distance</button>
      <button className="workflow-action secondary" onClick={() => { useInspection.getState().setAnglePoints([]); useEditor.getState().setTool('measure-angle') }}>Measure angle</button>
      <button className="workflow-action secondary" onClick={() => { useInspection.getState().setCirclePoints([]); useEditor.getState().setShowResult(true); useEditor.getState().setTool('measure-circle'); setError('') }}>Measure circle</button>
    </div>
    {(tool === 'measure-angle' || points.length > 0) && <p>For an angle, pick the first arm, then the vertex, then the second arm. {points.length}/3 points {angle}</p>}
    {(tool === 'measure-circle' || circlePoints.length > 0) && <CircleMeasurementReadout />}
    <label className="cad-select-label">Annotation label<input maxLength={80} value={label} onChange={event => setLabel(event.target.value)} /></label>
    <div className="workflow-actions">
      <button className="workflow-action" disabled={!measurement?.complete} onClick={() => pin('distance')}>Pin distance</button>
      <button className="workflow-action" disabled={!angle} onClick={() => pin('angle')}>Pin angle</button>
      <button className="workflow-action" disabled={!circle || !current} onClick={() => pin('diameter')}>Pin diameter</button>
    </div>
    <p>Annotations are fixed measurements of this geometry. Changes mark them for review and hide stale labels from the canvas.</p>
    {doc.annotations?.map(annotation => <div className="annotation-row" key={annotation.id}>
      <strong>{annotation.label}</strong>
      <span>{annotation.kind === 'diameter' ? 'Ø ' : ''}{formatDimension(annotationValue(annotation))} {annotation.kind === 'angle' ? '°' : 'mm'}</span>
      <small>{annotation.kind === 'diameter' ? 'Mesh circle estimate · ' : ''}{annotation.geometryKey === key ? 'Current geometry' : 'Needs review · geometry changed'}</small>
      <button className="workflow-text-action" onClick={() => { const state = useEditor.getState(); state.dispatch({ type: 'replace-document', document: { ...state.document, annotations: state.document.annotations?.filter(item => item.id !== annotation.id), revision: state.document.revision + 1, updatedAt: new Date().toISOString() } }) }}>Remove</button>
    </div>)}
    {error && <p role="alert" className="workflow-error">{error}</p>}
  </section>
}
