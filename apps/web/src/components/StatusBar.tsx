import { AlertTriangle, CheckCircle2, Cpu, Layers3 } from 'lucide-react'
import { useEditor } from '@/store/editor'
import {useInspection} from '@/store/inspection'
import { getPrintReadiness } from '@/lib/printReadiness'

export function StatusBar({backup}:{backup?:import("react").ReactNode}) {
  const status = useEditor((state) => state.geometryStatus)
  const snap=useInspection(s=>s.snapLabel),tool=useEditor(s=>s.tool),buildMs=useEditor(s=>s.geometryBuildMs)
  const analysis = useEditor((state) => state.analysis)
  const document = useEditor((state) => state.document)
  const mesh = useEditor((state) => state.mesh)
  const meshDocument = useEditor((state) => state.meshDocument)
  const placingNodeId = useEditor((state) => state.placingNodeId)
  const geometryError = useEditor((state) => state.geometryError)
  const readiness = getPrintReadiness({ document, meshDocument, analysis, geometryStatus: status, geometryError, placingNodeId })
  const current = meshDocument === document && !placingNodeId
  const dimensions = current ? analysis?.dimensions : undefined
  const printReady = readiness.status === 'ready'
  return (
    <footer className="statusbar">{backup}
      {tool==='draw-profile'&&<span role="status">{snap||'Click to place the first point'} · Shift locks an axis</span>}
      <div className={`engine-status ${status}`}><Cpu size={14} /><span>{placingNodeId ? 'Place your shape' : status === 'error' ? 'Geometry needs attention' : !current ? 'Updating model…' : 'Live preview ready'}</span></div>
      <div className="status-divider" />
      <div><Layers3 size={14} /><span>{document.nodes.length} features</span></div>
      <div title={buildMs!==null?`Last completed build: ${Math.round(buildMs)} ms`:undefined}><span>{current ? `${mesh?.triangleCount.toLocaleString() ?? 0} triangles` : 'Preview is not current'}</span></div>
      {dimensions && <div className="dimension-readout"><span>{dimensions.x.toFixed(1)} × {dimensions.y.toFixed(1)} × {dimensions.z.toFixed(1)} mm</span></div>}
      <button onClick={() => window.dispatchEvent(new CustomEvent('formforge:open-inspector', { detail: { tab: 'print' } }))} className={`print-status ${readiness.status}`} title="Open print checks">
        {printReady ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
        <span>{readiness.title}</span>
      </button>
    </footer>
  )
}
