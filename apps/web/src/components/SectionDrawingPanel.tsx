import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelDocument } from '@formforge/model'
import { evaluateSnapshot } from '@/geometry/evaluateSnapshot'
import { createSectionDrawing, sectionDrawingDxf, sectionDrawingSvg, type SectionDrawing } from '@/lib/sectionDrawing'
import { downloadBlob, safeFilename } from '@/lib/download'
import type { SectionSettings } from '@/lib/sectionView'
import { useEditor } from '@/store/editor'
import { useInspection } from '@/store/inspection'
import { WorkspaceDialog } from './WorkspaceDialog'

type Review = { document: ModelDocument; section: SectionSettings; drawing: SectionDrawing }
export function SectionDrawingPanel({ onClose }: { onClose: () => void }) {
  const document = useEditor(state => state.document)
  const placing = useEditor(state => state.placingNodeId)
  const section = useInspection(state => state.section)
  const [review, setReview] = useState<Review | null>(null)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('Generate a preview to review the linework before downloading.')
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const previous = useRef({ document, section, placing })
  useEffect(() => {
    if (previous.current.document !== document || previous.current.section !== section || previous.current.placing !== placing) {
      previous.current = { document, section, placing }
      setReview(null); setBuilding(false); setError('')
      setNotice('The project or section settings changed. Generate a new preview.')
    }
    return () => { generation.current++; controller.current?.abort() }
  }, [document, section, placing])
  const current = review?.document === document && review.section === section && !placing ? review.drawing : null
  const path = useMemo(() => current?.segments.map(([a,b]) => `M ${a[0]} ${-a[1]} L ${b[0]} ${-b[1]}`).join(' ') ?? '', [current])
  const generate = async () => {
    if (placing || building) return
    controller.current?.abort()
    const task = new AbortController(), token = ++generation.current
    controller.current = task
    setReview(null); setBuilding(true); setError(''); setNotice('')
    const isCurrent = () => !task.signal.aborted && token === generation.current && document === useEditor.getState().document && section === useInspection.getState().section && !useEditor.getState().placingNodeId
    try {
      const mesh = await evaluateSnapshot(document, task.signal)
      if (!isCurrent()) return
      const drawing = createSectionDrawing(mesh, section, task.signal)
      if (!isCurrent()) return
      setReview({ document, section, drawing })
      setNotice(drawing.segments.length ? 'Review this section before downloading.' : 'No section linework at this plane. Close this dialog and move the section plane to try again.')
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'Unable to generate this section drawing.')
    } finally {
      if (isCurrent()) setBuilding(false)
    }
  }
  const cancel = () => {
    generation.current++; controller.current?.abort()
    setBuilding(false); setReview(null); setNotice('Preview cancelled. Generate a new preview when ready.')
  }
  const download = (format: 'svg' | 'dxf') => {
    if (!current?.segments.length || building || !review) return
    if (review.document !== useEditor.getState().document || review.section !== useInspection.getState().section || useEditor.getState().placingNodeId) { setReview(null); setNotice('The project or section settings changed. Generate a new preview.'); return }
    try {
      const content = format === 'svg' ? sectionDrawingSvg(current, document.name) : sectionDrawingDxf(current)
      downloadBlob(new Blob([content], { type: format === 'svg' ? 'image/svg+xml' : 'application/dxf' }), `${safeFilename(document.name)}-section-${current.axis}-${safeFilename(String(current.offset))}.${format}`)
      setNotice('Download requested. Check your browser’s downloads.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to export this section drawing.') }
  }
  const bounds = current?.bounds
  return <WorkspaceDialog title="Section drawing" description="Preview and download SVG or DXF linework in millimeters." onClose={onClose}>
    <p><strong>{section.axis.toUpperCase()} = {Number(section.offset.toFixed(6))} mm</strong> · Complete evaluated model, including hidden shapes. View clipping does not need to be enabled.</p>
    <p className="workflow-caption">Tessellated linework, with straight segments instead of exact curves. Closed contours and toolpaths are not certified. Coplanar faces show boundary edges; a point-only contact produces no linework.</p>
    <p className="workflow-caption">Limit: 100,000 triangles / 50,000 segments. Coordinates use a 0.000001 mm tolerance. SVG has a 0.5 mm border; DXF retains model coordinates in the drawing plane.</p>
    {placing && <p role="alert">Finish placing your shape before generating a drawing.</p>}
    <div className="workflow-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="workflow-action" data-initial-focus disabled={building || !!placing} onClick={() => void generate()}>Generate preview</button>{building && <button className="workflow-action secondary" onClick={cancel}>Cancel preview</button>}</div>
    {building && <p role="status">Evaluating the model and generating section linework…</p>}
    {error && <p role="alert" className="workflow-error">{error}</p>}
    {bounds && current && <figure style={{ margin:'16px 0' }}>
      <svg role="img" aria-label="Section linework preview" viewBox={`${bounds.min[0] - 1} ${-bounds.max[1] - 1} ${bounds.width + 2} ${bounds.height + 2}`} style={{ display:'block', width:'100%', height:280, border:'1px solid var(--line)', borderRadius:12 }}>
        <title>Section plane {current.axis.toUpperCase()} = {current.offset} mm</title>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="workflow-caption">{bounds.width} × {bounds.height} mm · {current.segments.length.toLocaleString()} segments · Horizontal +{current.axes[0]} → · Vertical +{current.axes[1]} ↑</figcaption>
    </figure>}
    {notice && <p role="status">{notice}</p>}
    <footer className="dialog-footer"><div className="workflow-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="workflow-action secondary" disabled={!current?.segments.length || building} onClick={() => download('svg')}>Download SVG</button><button className="workflow-action secondary" disabled={!current?.segments.length || building} onClick={() => download('dxf')}>Download DXF</button></div></footer>
  </WorkspaceDialog>
}
