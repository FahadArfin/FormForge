import { AlertTriangle, CheckCircle2, Cpu, Layers3 } from 'lucide-react'
import { useEditor } from '@/store/editor'

export function StatusBar() {
  const status = useEditor((state) => state.geometryStatus)
  const analysis = useEditor((state) => state.analysis)
  const document = useEditor((state) => state.document)
  const mesh = useEditor((state) => state.mesh)
  const dimensions = analysis?.dimensions
  return (
    <footer className="statusbar">
      <div className={`engine-status ${status}`}><Cpu size={14} /><span>{status === 'building' ? 'Live preview · syncing' : status === 'error' ? 'Geometry needs attention' : 'Live preview ready'}</span></div>
      <div className="status-divider" />
      <div><Layers3 size={14} /><span>{document.nodes.length} features</span></div>
      <div><span>{mesh?.triangleCount.toLocaleString() ?? 0} triangles</span></div>
      {dimensions && <div className="dimension-readout"><span>{dimensions.x.toFixed(1)} × {dimensions.y.toFixed(1)} × {dimensions.z.toFixed(1)} mm</span></div>}
      <div className={`print-status ${analysis?.status ?? 'blocked'}`}>
        {analysis?.status === 'ready' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        <span>{analysis?.status === 'ready' ? 'Ready to print' : analysis?.issues[0]?.title ?? 'Checking printability'}</span>
      </div>
    </footer>
  )
}
