import { AlertTriangle, CheckCircle2, Cpu, Layers3 } from 'lucide-react'
import { useEditor } from '@/store/editor'

export function StatusBar() {
  const status = useEditor((state) => state.geometryStatus)
  const analysis = useEditor((state) => state.analysis)
  const document = useEditor((state) => state.document)
  const mesh = useEditor((state) => state.mesh)
  const meshDocument = useEditor((state) => state.meshDocument)
  const placingNodeId = useEditor((state) => state.placingNodeId)
  const current = meshDocument === document && !placingNodeId
  const dimensions = current ? analysis?.dimensions : undefined
  const printReady = current && analysis?.status === 'ready'
  return (
    <footer className="statusbar">
      <div className={`engine-status ${status}`}><Cpu size={14} /><span>{placingNodeId ? 'Place your shape' : status === 'error' ? 'Geometry needs attention' : !current ? 'Updating model…' : 'Live preview ready'}</span></div>
      <div className="status-divider" />
      <div><Layers3 size={14} /><span>{document.nodes.length} features</span></div>
      <div><span>{current ? `${mesh?.triangleCount.toLocaleString() ?? 0} triangles` : 'Rebuilding solid'}</span></div>
      {dimensions && <div className="dimension-readout"><span>{dimensions.x.toFixed(1)} × {dimensions.y.toFixed(1)} × {dimensions.z.toFixed(1)} mm</span></div>}
      <div className={`print-status ${current ? analysis?.status ?? 'blocked' : 'blocked'}`}>
        {printReady ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        <span>{printReady ? 'Ready to print' : placingNodeId ? 'Finish placement' : status === 'error' ? 'Check the modeling error' : !document.nodes.length ? 'Add your first shape' : current ? analysis?.issues[0]?.title ?? 'Checking printability' : 'Checking printability'}</span>
      </div>
    </footer>
  )
}
