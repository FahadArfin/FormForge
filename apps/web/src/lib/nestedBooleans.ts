import type {ModelNode,BooleanLayer} from '@formforge/model'
import {entityNodes} from './shapeEntities'

/** Wrap complete entities; never rewrite the operation inside an operand. */
export function nestCombination(nodes:ModelNode[],selectedIds:string[],mode:'union'|'subtract'|'intersect'|'hull',id:string):ModelNode[]{
 const selected=new Set(selectedIds.flatMap(id=>entityNodes(nodes,id).map(n=>n.id)))
 const commonPath=(paths:string[][])=>{const prefix=[...(paths[0]??[])];for(const path of paths)while(prefix.some((part,i)=>path[i]!==part))prefix.pop();return prefix}
 const scope=(parts:ModelNode[])=>commonPath(parts.map(n=>n.assemblyPath??[]))
 const boundary=commonPath(selectedIds.map(id=>scope(entityNodes(nodes,id)))).length
 const seen=new Set<string>(),operands:ModelNode[][]=[]
 for(const selectedId of selectedIds){
  if(seen.has(selectedId))continue
  let parts=entityNodes(nodes,selectedId)
  const assembly=scope(parts)
  if(assembly.length>boundary){
   const branch=assembly.slice(0,boundary+1)
   parts=nodes.filter(n=>{const path=scope(entityNodes(nodes,n.id));return branch.every((part,i)=>path[i]===part)})
   if(parts.some(n=>!selected.has(n.id)))throw new Error('Select the complete inserted assembly before combining it with other objects.')
  }
  if(parts.length){operands.push(parts);parts.forEach(n=>seen.add(n.id))}
 }
 if(operands.length<2)throw new Error('Select at least two separate objects to combine.')
 if(operands.flat().some(n=>n.locked))throw new Error('Unlock every part before combining.')
 if(operands.flat().some(n=>(n.booleanPath?.length??0)>=32))throw new Error('This object has reached the 32-level combination limit.')
 const wrapped=operands.flatMap((parts,index)=>parts.map(node=>{
  const layer:BooleanLayer={id,operandId:`${id}:${index}`,mode:index===0||mode==='union'||mode==='hull'?'add':mode==='subtract'?'cut':'intersect',operation:mode==='hull'?'hull':'boolean'}
  return {...node,booleanPath:[layer,...(node.booleanPath??[])]}
 }))
 const result=nodes.filter(n=>!seen.has(n.id));result.splice(nodes.findIndex(n=>seen.has(n.id)),0,...wrapped);return result
}

/** Peel one level, revealing intact previous groups and their original roles. */
export function separateOuter(nodes:ModelNode[],ids:string[]):ModelNode[]{
 const groups=new Set(ids.flatMap(id=>entityNodes(nodes,id)).map(n=>n.booleanPath?.[0]?.id).filter(Boolean))
 return nodes.map(n=>{if(!groups.has(n.booleanPath?.[0]?.id))return n;const copy={...n};if(n.booleanPath!.length===1)delete copy.booleanPath;else copy.booleanPath=n.booleanPath!.slice(1);return copy})
}
