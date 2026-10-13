import {Combine,Scissors,ScanLine,Ungroup} from 'lucide-react'
import {useEditor} from '@/store/editor'
export function ShapeBooleanTools(){
 const nodes=useEditor(s=>s.document.nodes),ids=useEditor(s=>s.selectedNodeIds),placing=useEditor(s=>s.placingNodeId)
 const selected=nodes.filter(n=>ids.includes(n.id)),locked=selected.some(n=>n.locked),grouped=selected.some(n=>n.combined&&n.groupId)
 const combine=useEditor(s=>s.combineSelected),separate=useEditor(s=>s.ungroupSelected)
 const disabled=Boolean(placing)||locked||selected.length<2||grouped
 const base=nodes.find(n=>n.id===ids[0])
 return <div className="shape-boolean-section"><div className="shape-boolean-tools" role="group" aria-label="Combine shapes">
  <button disabled={disabled} onClick={()=>combine('union')} title="Join selected shapes into one object"><Combine size={18}/><span>Join</span></button>
  <button disabled={disabled} onClick={()=>combine('subtract')} title={`Keep ${base?.name??'the first selected shape'} and subtract the others`}><Scissors size={18}/><span>Exclude</span></button>
  <button disabled={disabled} onClick={()=>combine('intersect')} title="Keep only the volume shared by all selected shapes"><ScanLine size={18}/><span>Intersect</span></button>
 </div>{grouped?<button className="shape-separate" disabled={locked||Boolean(placing)} onClick={separate}><Ungroup size={15}/>Separate</button>:<p>{locked?'Unlock shapes to combine them.':selected.length>1?`Exclude keeps ${base?.name??'the first selected shape'}.`:'Shift-click shapes to select more than one, or use the list’s multi-select.'}</p>}</div>
}
