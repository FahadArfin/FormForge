import {useState} from 'react'
import {useEditor} from '@/store/editor'
import {shapeDimensions,resizeNodeDimension} from '@/lib/selectionDimensions'
import {NumberInput} from './NumberInput'
export function SelectionDimensions(){
 const node=useEditor(s=>s.selectedNodeIds.length===1?s.document.nodes.find(n=>n.id===s.selectedNodeId):undefined),update=useEditor(s=>s.updateNode),[linked,setLinked]=useState(false),[error,setError]=useState('')
 if(!node||node.locked)return null
 const dimensions=shapeDimensions(node)
 return <details className="selection-dimensions"><summary>Size · {node.name}</summary><p>Shape axes · before cuts and surface modifiers</p><div className="size-fields">{(['x','y','z'] as const).map(axis=><NumberInput key={`${node.id}-${axis}`} label={`${axis.toUpperCase()} size`} value={dimensions[axis]} suffix="mm" min={0.001} onChange={v=>{try{update(node.id,{transform:resizeNodeDimension(node,axis,v,linked)});setError('')}catch(e){setError((e as Error).message)}}}/>)}</div><label><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/> Keep proportions</label>{error&&<p role="alert">{error}</p>}</details>
}
