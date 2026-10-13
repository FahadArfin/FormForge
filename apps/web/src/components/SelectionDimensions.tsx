import {useState} from 'react'
import {useEditor} from '@/store/editor'
import {shapeDimensions,resizeNodeDimension} from '@/lib/selectionDimensions'
import {NumberInput} from './NumberInput'
import {useResizeScale} from '@/store/resizePreview'
export function SelectionDimensions(){
 const node=useEditor(s=>s.selectedNodeIds.length===1?s.document.nodes.find(n=>n.id===s.selectedNodeId):undefined),update=useEditor(s=>s.updateNode),[linked,setLinked]=useState(false),[error,setError]=useState('')
 const tool=useEditor(s=>s.tool),placing=useEditor(s=>s.placingNodeId),setTool=useEditor(s=>s.setTool)
 const previewScale=useResizeScale(node?.id)
 if(!node||node.locked||placing)return null
 const dimensions=shapeDimensions(node,previewScale)
 return <><div className="selection-dimensions"><div className="shape-direct-actions" role="group" aria-label="Shape manipulation"><button aria-pressed={tool==='select'||tool==='move'} onClick={()=>setTool('select')}>Move shape</button><button aria-pressed={tool==='scale'} onClick={()=>setTool('scale')}>Resize shape</button></div><details><summary>Size · {node.name}</summary><p>Shape axes · before cuts and surface modifiers</p><div className="size-fields">{(['x','y','z'] as const).map(axis=><NumberInput key={`${node.id}-${axis}`} label={`${axis.toUpperCase()} size`} value={dimensions[axis]} suffix="mm" min={0.001} onChange={v=>{try{update(node.id,{transform:resizeNodeDimension(node,axis,v,linked)});setError('')}catch(e){setError((e as Error).message)}}}/>)}</div><label><input type="checkbox" checked={linked} onChange={e=>setLinked(e.target.checked)}/> Keep proportions</label>{error&&<p role="alert">{error}</p>}</details></div>{tool==='scale'&&<div className="resize-dimensions" role="group" aria-label="Live shape dimensions">{(['x','y','z'] as const).map((axis,index)=><div key={axis}><span>{['Width','Depth','Height'][index]}</span><output data-axis={axis} aria-label={['Width','Depth','Height'][index]} aria-live="off">{Number(dimensions[axis].toFixed(2))} mm</output></div>)}</div>}</>
}
