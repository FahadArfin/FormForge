import type {ModelDocument} from '@formforge/model'
const same=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b)
/** Labels describe snapshot differences; this is not a parametric feature timeline. */
export function describeChange(before:ModelDocument,after:ModelDocument):string {
 const oldIds=new Set(before.nodes.map(n=>n.id)),newIds=new Set(after.nodes.map(n=>n.id))
 const added=after.nodes.filter(n=>!oldIds.has(n.id)),removed=before.nodes.filter(n=>!newIds.has(n.id))
 if(added.length&&!removed.length)return added.length===1?`Add ${added[0]!.name}`:`Add ${added.length} shapes`
 if(removed.length&&!added.length)return removed.length===1?`Remove ${removed[0]!.name}`:`Remove ${removed.length} shapes`
 if(added.length||removed.length)return 'Replace shapes'
 if(before.name!==after.name)return 'Rename project'
 if(!same(before.namedParameters,after.namedParameters))return 'Edit parameters'
 if(!same(before.sculptStrokes,after.sculptStrokes))return 'Volume sculpt edit'
 if(!same(before.annotations,after.annotations))return 'Edit measurement annotations'
 if(!same(before.printer,after.printer))return 'Change printer settings'
 const previous=new Map(before.nodes.map(n=>[n.id,n]))
 let moves=0,rotates=0,scales=0,edits=0
 for(const n of after.nodes){const old=previous.get(n.id)!;if(n===old)continue
  if(n.kind!==old.kind)return `Convert ${old.name} to ${n.kind}`
  if(n.mesh!==old.mesh && (n.mesh?.positions!==old.mesh?.positions || n.mesh?.indices!==old.mesh?.indices))return `Edit ${n.name} mesh`
  if(n.name!==old.name)return `Rename ${old.name}`
  if(!same(n.transform.position,old.transform.position))moves++
  if(!same(n.transform.rotation,old.transform.rotation))rotates++
  if(!same(n.transform.scale,old.transform.scale))scales++
  if(!same(n.parameters,old.parameters))edits++
  if(n.locked!==old.locked)return `${n.locked?'Lock':'Unlock'} ${n.name}`
  if(n.visible!==old.visible)return `${n.visible?'Show':'Hide'} ${n.name}`
  if(n.suppressed!==old.suppressed)return `${n.suppressed?'Disable':'Enable'} ${n.name}`
 }
 if([moves,rotates,scales].filter(Boolean).length>1)return 'Transform selection'
 if(moves)return `Move ${moves===1?'shape':`${moves} shapes`}`
 if(rotates)return `Rotate ${rotates===1?'shape':`${rotates} shapes`}`
 if(scales)return `Scale ${scales===1?'shape':`${scales} shapes`}`
 if(edits)return 'Edit shape dimensions'
 if(!same(before.nodes.map(n=>n.id),after.nodes.map(n=>n.id)))return 'Reorder modeling steps'
 return 'Edit project'
}
export function jumpToHistory(document:ModelDocument,undoStack:ModelDocument[],redoStack:ModelDocument[],index:number) {
 const states=[...undoStack,document,...redoStack]
 if(!Number.isInteger(index)||index<0||index>=states.length)throw new Error('Choose a state in this session history.')
 if(states.some(s=>s.id!==document.id))throw new Error('Session history belongs to a different project.')
 return {document:states[index]!,undoStack:states.slice(0,index).slice(-50),redoStack:states.slice(index+1).slice(0,50)}
}
